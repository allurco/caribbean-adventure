import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { ErrorBoundary } from "react-error-boundary";
import { Mesh, MathUtils, Group, type Object3D } from "three";
import type { ShipClass } from "../game/types";
import { type ShipFoamSource, shipFoamSources } from "./shipFoamSources";
import { SHIP_RIDE_HEIGHT, SHIP_SINK_DEPTH, SHIP_WATERLINE_Y, shipHoverBox, shipHullBox, shipWaterline } from "./shipHull";
import { type OpenWater, type Point, type ShipMotion, courseIncludes, restingMotion, setCourse, stepMotion } from "./shipMotion";
import { useShipWavePose } from "./useShipWavePose";
import { SHIP_POSE_PRIORITY } from "./visuals/frameOrder";
import { type ShipModel, SHIP_MODELS, shipModel, shipModelPlacement, shipModelUrl } from "./shipModels";
import { mergeShipModel } from "./shipModelMerge";
import { dressShipModel } from "./shipDressing";
import { shipFlagMaterial } from "./shipFlagMaterials";
import type { ShipFlag } from "./shipFlags";
import { createShipWindUniforms, shipWindPose, writeShipWindPose } from "./shipWind";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { SCENE_WIND } from "./visuals/sceneWind";
import { useSeaSurface } from "./visuals/seaSurfaceContext";

const modelUrl = (model: ShipModel) => shipModelUrl(model, import.meta.env.BASE_URL);

// Fetch the models as the board loads, not when the first ship of a class appears.
for (const model of Object.values(SHIP_MODELS)) if (model) useGLTF.preload(modelUrl(model), false, false);

const logModelFailure = (model: ShipModel, error: unknown) =>
  console.warn(`[ship] model ${model.file} failed to load; drawing the hull box`, error);

/** Each loaded model merged once (#136), however many ships draw it. */
const mergedModels = new WeakMap<Object3D, Group>();
const mergedShipModel = (scene: Object3D, model: ShipModel): Group => {
  let merged = mergedModels.get(scene);
  if (!merged) {
    // The sails, the patches and band on them, and the flag and pennant move in the wind (#204).
    const wind = { sails: model.parts.sails, sailDecals: model.sailDecals, cloth: [model.parts.flag, model.parts.pennant] };
    mergedModels.set(scene, (merged = mergeShipModel(scene, model.tintedParts, model.parts.flag, wind)));
  }
  return merged;
};

const SINK_DURATION = 2.0; // seconds for sinking animation
/** Seconds over which a ship's reported speed (for its hull foam) eases back to 0 after a move, so the wake fades rather than snaps off. */
const FOAM_SPEED_DECAY = 0.8;

/** Whether the ship at rest is on its hex (`position`), up to whole wrap widths. */
function atPosition(m: ShipMotion, position: readonly [number, number, number], wrapWidth: number): boolean {
  const dx = Number.isFinite(wrapWidth) ? Math.abs(((m.x - position[0]) % wrapWidth + 1.5 * wrapWidth) % wrapWidth - wrapWidth / 2) : Math.abs(m.x - position[0]);
  return dx < 1e-3 && Math.abs(m.z - position[2]) < 1e-3;
}

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
  seaRoute,
  openWater,
  initialHeading = 0,
  foamId,
  foamPlayer = false,
  onUnderway,
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
   * The waypoints (world xz) of a move from `from` to `to`, ending on `to`
   * (shipRoute.ts): a ship that moves several hexes at once sails through
   * them rather than straight over whatever lies between. Just `[to]` if not given.
   */
  seaRoute?: (from: Point, to: Point) => Point[];
  /** Where the open water is, so the ship comes about clear of the shore (shipRoute.ts's openWaterFrom). */
  openWater?: OpenWater;
  /** The heading it lies at when first drawn, before it sails (shipSpawnHeading.ts). Read once, on mount. */
  initialHeading?: number;
  /**
   * Registers the ship's animated position for the water's hull foam under
   * this id (shipFoamSources.ts, #38 step 7). Given only in the canonical
   * copy of a wrapping world, so each ship is registered once.
   */
  foamId?: string;
  /** A player's ship, which keeps its hull foam ahead of the NPCs when more than SHIP_FOAM_CAP register. */
  foamPlayer?: boolean;
  /** Told when the ship gets under way (true) and when it comes to rest at the end of its course (false). */
  onUnderway?: (underway: boolean) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onClick?: () => void;
}) {
  const ref = useRef<Group>(null!);
  const prevTarget = useRef<[number, number, number] | null>(null);
  const initialized = useRef(false);
  /** How it sails (shipMotion.ts, #212): where it is on its course, its heading, way, heel and pitch. */
  const motion = useRef<ShipMotion>(restingMotion(position[0], position[2], initialHeading));
  const reducedMotion = usePrefersReducedMotion();
  const foamSpeed = useRef(0);
  const wasUnderway = useRef(false);
  /** Written in place each frame (the registry copies it), so registering allocates nothing. */
  const foamSource = useRef<ShipFoamSource>({ x: 0, z: 0, headingX: 0, headingZ: 1, hullLength: 0, beam: 0, roundness: 0, speed: 0, player: false });
  const hull = shipHullBox(shipClass);
  const waterline = shipWaterline(shipClass);
  const hover = shipHoverBox(shipClass);
  const model = shipModel(shipClass);
  // The wave pose rides on an inner group, under the group that sails and turns; the heel and pitch of its sailing add to it.
  const lean = useCallback(() => motion.current, []);
  const innerRef = useShipWavePose(hull, lean);
  // The heading the ship's group has turned to this frame: its sails and flags set to it (#204).
  const heading = useCallback(() => ref.current?.rotation.y ?? 0, []);

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
        motion.current = restingMotion(position[0], position[2], initialHeading);
        group.rotation.y = initialHeading;
        initialized.current = true;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    if (!ref.current) return;

    const prev = prevTarget.current;
    if (!prev || prev[0] !== position[0] || prev[1] !== position[1] || prev[2] !== position[2]) {
      prevTarget.current = position;
      // A new hex: set a course to it from wherever the ship is on its way,
      // through the hexes between if it moved more than one, the short way
      // over the seam on a wrapping map (shipMotion.ts).
      const here: Point = [motion.current.x, motion.current.z];
      const to: Point = [position[0], position[2]];
      // A hex already on its course (a planned route given whole, #213) needs no new one
      if (!courseIncludes(motion.current, to, wrapWidth)) {
        motion.current = setCourse(motion.current, seaRoute ? seaRoute(here, to) : [to], wrapWidth, openWater);
      }
    } else if (!motion.current.voyage && !atPosition(motion.current, position, wrapWidth)) {
      // At rest somewhere else (a route cut short after it was given whole): sail to where it is
      motion.current = setCourse(motion.current, [[position[0], position[2]]], wrapWidth, openWater);
    }

    const m = (motion.current = stepMotion(motion.current, delta, reducedMotion));
    const underway = m.voyage !== null;
    if (underway !== wasUnderway.current) {
      wasUnderway.current = underway;
      onUnderway?.(underway);
    }
    ref.current.position.set(m.x, position[1] + SHIP_WATERLINE_Y, m.z);
    ref.current.rotation.y = m.heading;

    if (foamId) {
      const p = ref.current.position;
      // Its way along the course, which does not spike when the ship is moved a wrap width over the seam.
      foamSpeed.current = Math.max(m.speed, foamSpeed.current * Math.exp(-delta / FOAM_SPEED_DECAY));
      const rot = m.heading;
      const source = foamSource.current;
      source.x = p.x;
      source.z = p.z;
      source.headingX = Math.sin(rot);
      source.headingZ = Math.cos(rot);
      source.hullLength = waterline.length;
      source.beam = waterline.beam;
      source.roundness = waterline.roundness;
      source.speed = foamSpeed.current;
      source.player = foamPlayer;
      shipFoamSources.set(foamId, source);
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
          // A model that fails to load leaves the hull box, not a broken scene
          <ErrorBoundary fallback={box} onError={(error) => logModelFailure(model, error)}>
            <Suspense fallback={box}>
              <ShipModelMesh model={model} colour={color} flag={flag} heading={heading} />
            </Suspense>
          </ErrorBoundary>
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
 * owner's colour and flying its flag (#134), its sails and flags set to the
 * scene's wind for its `heading` at the wave clock's time (#204): still
 * under reduced motion, limp and slack while it sinks. Suspends while the
 * file loads.
 */
export function ShipModelMesh({
  model,
  colour,
  flag,
  heading,
  sinking = false,
}: {
  model: ShipModel;
  colour: string;
  flag: ShipFlag | null;
  /** The ship's heading this frame (its group's rotation about +Y). */
  heading: () => number;
  sinking?: boolean;
}) {
  const { scene } = useGLTF(modelUrl(model), false, false);
  // One copy per ship of the class's merged model: the nodes are its own, the geometry and materials shared.
  const copy = useMemo(() => {
    const clone = mergedShipModel(scene, model).clone(true);
    clone.traverse((object) => {
      if ((object as Mesh).isMesh) object.castShadow = object.receiveShadow = true;
    });
    return clone;
  }, [scene, model]);
  // Its own wind: the uniforms its canvas, flag and pennant move in.
  const [wind] = useState(createShipWindUniforms);
  const sea = useSeaSurface();
  const reducedMotion = usePrefersReducedMotion();
  // Its own material copies for the tinted parts and the cloth, disposed when the ship or its colours change.
  useLayoutEffect(() => dressShipModel(copy, { colour, flagMaterial: shipFlagMaterial(flag), wind }), [copy, colour, flag, wind]);
  useFrame(() => {
    const seconds = sea?.clock.waveTimeAt() ?? 0;
    writeShipWindPose(wind, shipWindPose({ heading: heading(), wind: SCENE_WIND, seconds, reducedMotion, sinking }));
  }, SHIP_POSE_PRIORITY);
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
  flag = null,
  shipClass,
  heading = 0,
  onComplete,
}: {
  position: [number, number, number];
  color: string;
  /** The flag it flew, which goes down limp with it (#204). */
  flag?: ShipFlag | null;
  shipClass?: ShipClass;
  /** The heading the ship last sailed on (shipHeading.ts), which it goes down facing. */
  heading?: number;
  onComplete: () => void;
}) {
  const ref = useRef<Group>(null!);
  const hull = shipHullBox(shipClass);
  const model = shipModel(shipClass);
  const innerRef = useShipWavePose(hull);
  const sunkHeading = useCallback(() => heading, [heading]);
  const progressRef = useRef(0);
  const startY = position[1] + SHIP_WATERLINE_Y;
  const [opacity, setOpacity] = useState(1);
  const completedRef = useRef(false);

  useFrame((_, delta) => {
    if (!ref.current || completedRef.current) return;

    progressRef.current = Math.min(progressRef.current + delta / SINK_DURATION, 1);
    const t = smoothstep(progressRef.current);

    // Sink down below the swell it rides
    ref.current.position.y = -MathUtils.lerp(0, SHIP_SINK_DEPTH, t);

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

  // The box fades as it goes; a model goes down whole, its flag limp and its sails slack (#204).
  const box = (
    <mesh position-y={SHIP_RIDE_HEIGHT} castShadow>
      <boxGeometry args={[...hull]} />
      <meshStandardMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );

  // Like Ship: the outer group stands where it sank, facing its last heading;
  // the inner group rides the swell; the ship sinks, rolls and pitches in it.
  return (
    <group position={[position[0], startY, position[2]]} rotation-y={heading}>
      <group ref={innerRef}>
        <group ref={ref}>
          {model ? (
            <ErrorBoundary fallback={box} onError={(error) => logModelFailure(model, error)}>
              <Suspense fallback={box}>
                <ShipModelMesh model={model} colour={color} flag={flag} heading={sunkHeading} sinking />
              </Suspense>
            </ErrorBoundary>
          ) : (
            box
          )}
        </group>
      </group>
    </group>
  );
}
