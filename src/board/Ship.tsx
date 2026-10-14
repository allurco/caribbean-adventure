import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Vector3, Mesh, MathUtils, Group, type Object3D } from "three";
import type { ShipClass } from "../game/types";
import { seamAwareStart } from "./wrapView";
import { shipFoamSources } from "./shipFoamSources";
import { SHIP_RIDE_HEIGHT, SHIP_SINK_DEPTH, SHIP_WATERLINE_Y, shipHoverBox, shipHullBox } from "./shipHull";
import { moveHeading } from "./shipHeading";
import { useShipWavePose } from "./useShipWavePose";
import { type ShipModel, SHIP_MODELS, shipModel, shipModelPlacement, shipModelUrl } from "./shipModels";
import { mergeShipModel } from "./shipModelMerge";
import { dressShipModel } from "./shipDressing";
import { shipFlagMaterial } from "./shipFlagMaterials";
import type { ShipFlag } from "./shipFlags";

const modelUrl = (model: ShipModel) => shipModelUrl(model, import.meta.env.BASE_URL);

// Fetch the models as the board loads, not when the first ship of a class appears.
for (const model of Object.values(SHIP_MODELS)) if (model) useGLTF.preload(modelUrl(model), false, false);

/** Each loaded model merged once (#136), however many ships draw it. */
const mergedModels = new WeakMap<Object3D, Group>();
const mergedShipModel = (scene: Object3D, model: ShipModel): Group => {
  let merged = mergedModels.get(scene);
  if (!merged) mergedModels.set(scene, (merged = mergeShipModel(scene, model.tintedParts, model.parts.flag)));
  return merged;
};

const DURATION = 0.4; // seconds
const SINK_DURATION = 2.0; // seconds for sinking animation
/** Seconds over which a ship's reported speed (for its hull foam) eases back to 0 after a move, so the wake fades rather than snaps off. */
const FOAM_SPEED_DECAY = 0.8;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function Ship({
  position,
  color,
  flag = null,
  shipClass,
  onPointerEnter,
  onPointerLeave,
  onClick,
  wrapWidth = Infinity,
  foamId,
  foamPlayer = false,
}: {
  position: [number, number, number];
  /** The owner's colour: the box, or the model's pennant, hull stripe and main-course band (#134). */
  color: string;
  /** The flag a model flies (#134): its captain's nation, or the Jolly Roger; `null` for bare cloth. */
  flag?: ShipFlag | null;
  shipClass?: ShipClass;
  /** World width of the map's east–west wrap (Infinity if it does not wrap). */
  wrapWidth?: number;
  /**
   * Registers the ship's animated position for the water's hull foam under
   * this id (shipFoamSources.ts, #38 step 7). Given only in the canonical
   * copy of a wrapping world, so each ship is registered once.
   */
  foamId?: string;
  /** A player's ship, which keeps its hull foam ahead of the NPCs when more than SHIP_FOAM_CAP register. */
  foamPlayer?: boolean;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onClick?: () => void;
}) {
  const ref = useRef<Group>(null!);
  const from = useMemo(() => new Vector3(), []);
  const to = useMemo(() => new Vector3(), []);
  const prevTarget = useRef<[number, number, number] | null>(null);
  const progressRef = useRef(1);
  const initialized = useRef(false);
  const targetYRotation = useRef(0);
  const foamPrevPosition = useRef<Vector3 | null>(null);
  const foamSpeed = useRef(0);
  const hull = shipHullBox(shipClass);
  const hullLength = hull[2];
  const hover = shipHoverBox(shipClass);
  const model = shipModel(shipClass);
  // The wave pose rides on an inner group, under the group that sails and turns.
  const innerRef = useShipWavePose(hull);

  useEffect(() => {
    if (!foamId) return;
    return () => shipFoamSources.remove(foamId);
  }, [foamId]);

  const groupRef = useCallback(
    (group: Group | null) => {
      if (!group) return;
      ref.current = group;
      if (!initialized.current) {
        group.position.set(position[0], position[1] + SHIP_WATERLINE_Y, position[2]);
        prevTarget.current = position;
        to.set(position[0], position[1] + SHIP_WATERLINE_Y, position[2]);
        initialized.current = true;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    if (!ref.current) return;

    const prev = prevTarget.current;
    if (
      !prev ||
      prev[0] !== position[0] ||
      prev[1] !== position[1] ||
      prev[2] !== position[2]
    ) {
      from.copy(ref.current.position);
      to.set(position[0], position[1] + SHIP_WATERLINE_Y, position[2]);
      // Across the seam, sail straight over it rather than back across the map.
      from.setX(seamAwareStart(from.x, to.x, wrapWidth));
      prevTarget.current = position;
      const heading = moveHeading([from.x, from.z], [to.x, to.z], Infinity);
      if (heading !== null) {
        progressRef.current = 0;
        targetYRotation.current = heading;
      }
    }

    // Smoothly rotate toward target heading
    ref.current.rotation.y = MathUtils.lerp(
      ref.current.rotation.y,
      targetYRotation.current,
      1 - Math.pow(0.001, delta),
    );

    if (progressRef.current < 1) {
      progressRef.current = Math.min(progressRef.current + delta / DURATION, 1);
      const t = smoothstep(progressRef.current);
      ref.current.position.lerpVectors(from, to, t);
    }

    if (foamId) {
      const p = ref.current.position;
      const prev = foamPrevPosition.current ?? (foamPrevPosition.current = p.clone());
      const raw = delta > 0 ? prev.distanceTo(p) / delta : 0;
      prev.copy(p);
      foamSpeed.current = Math.max(raw, foamSpeed.current * Math.exp(-delta / FOAM_SPEED_DECAY));
      const rot = ref.current.rotation.y;
      shipFoamSources.set(foamId, {
        x: p.x,
        z: p.z,
        headingX: Math.sin(rot),
        headingZ: Math.cos(rot),
        hullLength,
        speed: foamSpeed.current,
        player: foamPlayer,
      });
    }
  });

  // The box's centre rides above the waterline the group stands on.
  const box = (
    <mesh position-y={SHIP_RIDE_HEIGHT} castShadow receiveShadow>
      <boxGeometry args={[...hull]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );

  // The group stands on the sea at the ship's waterline, sails and turns; its
  // inner group rides the swell about that waterline (#150); the box or the
  // model inside it is what is drawn and hit, so hover and click work over the
  // whole model and follow the tilted hull. An undrawn box from the hull up to
  // the masthead (ADR 0006) catches the pointer between the sails too.
  return (
    <group
      ref={groupRef}
      onPointerEnter={(e) => {
        e.stopPropagation();
        onPointerEnter?.();
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        onPointerLeave?.();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <group ref={innerRef}>
        <mesh position-y={(hover.top + hover.bottom) / 2}>
          <boxGeometry args={[hover.width, hover.top - hover.bottom, hover.length]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        {model ? (
          <Suspense fallback={box}>
            <ShipModelMesh model={model} colour={color} flag={flag} />
          </Suspense>
        ) : (
          box
        )}
      </group>
    </group>
  );
}

/**
 * A class's generated model in its own frame (real metres, origin at the
 * waterline amidships, bow along −Z), placed in the ship's wave-pose group:
 * scaled to ship scale, turned onto the heading, its waterline on the
 * group's, which is on the sea (shipModelPlacement, #150). Dressed in its
 * owner's colour and flying its flag (#134). Suspends while the file loads.
 */
function ShipModelMesh({ model, colour, flag }: { model: ShipModel; colour: string; flag: ShipFlag | null }) {
  const { scene } = useGLTF(modelUrl(model), false, false);
  // One copy per ship of the class's merged model: the nodes are its own, the geometry and materials shared.
  const copy = useMemo(() => {
    const clone = mergedShipModel(scene, model).clone(true);
    clone.traverse((object) => {
      if ((object as Mesh).isMesh) object.castShadow = object.receiveShadow = true;
    });
    return clone;
  }, [scene, model]);
  // Its own material copies for the tinted parts, disposed when the ship or its colours change.
  useLayoutEffect(() => dressShipModel(copy, { colour, flagMaterial: shipFlagMaterial(flag) }), [copy, colour, flag]);
  const { y, rotationY, scale } = shipModelPlacement();
  return (
    <group position-y={y} rotation-y={rotationY} scale={scale}>
      <primitive object={copy} />
    </group>
  );
}

export function SinkingShip({
  position,
  color,
  shipClass,
  heading = 0,
  onComplete,
}: {
  position: [number, number, number];
  color: string;
  shipClass?: ShipClass;
  /** The heading the ship last sailed on (shipHeading.ts), which it goes down facing. */
  heading?: number;
  onComplete: () => void;
}) {
  const ref = useRef<Mesh>(null!);
  const hull = shipHullBox(shipClass);
  const innerRef = useShipWavePose(hull);
  const progressRef = useRef(0);
  const startY = position[1] + SHIP_WATERLINE_Y;
  const [opacity, setOpacity] = useState(1);
  const completedRef = useRef(false);

  useFrame((_, delta) => {
    if (!ref.current || completedRef.current) return;

    progressRef.current = Math.min(progressRef.current + delta / SINK_DURATION, 1);
    const t = smoothstep(progressRef.current);

    // Sink down from the ride height, below the swell it rides
    ref.current.position.y = SHIP_RIDE_HEIGHT - MathUtils.lerp(0, SHIP_SINK_DEPTH, t);

    // Tilt to one side (roll)
    ref.current.rotation.z = MathUtils.lerp(0, Math.PI / 4, t);

    // Slight forward pitch
    ref.current.rotation.x = MathUtils.lerp(0, Math.PI / 8, t);

    // Fade out
    const newOpacity = MathUtils.lerp(1, 0, t);
    setOpacity(newOpacity);

    if (progressRef.current >= 1 && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  });

  // Like Ship: the outer group stands where it sank, facing its last heading;
  // the inner group rides the swell; the hull sinks, rolls and pitches in it.
  return (
    <group position={[position[0], startY, position[2]]} rotation-y={heading}>
      <group ref={innerRef}>
        <mesh ref={ref} position-y={SHIP_RIDE_HEIGHT} castShadow>
          <boxGeometry args={[...hull]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={opacity}
          />
        </mesh>
      </group>
    </group>
  );
}
