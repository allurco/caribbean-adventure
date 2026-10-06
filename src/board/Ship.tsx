import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, Mesh, MathUtils } from "three";
import type { ShipClass } from "../game/types";
import { seamAwareStart } from "./wrapView";
import { shipFoamSources } from "./shipFoamSources";

const DURATION = 0.4; // seconds
const SINK_DURATION = 2.0; // seconds for sinking animation
/** Seconds over which a ship's reported speed (for its hull foam) eases back to 0 after a move, so the wake fades rather than snaps off. */
const FOAM_SPEED_DECAY = 0.8;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

const SHIP_GEOMETRY: Record<ShipClass, [number, number, number]> = {
  Sloop: [0.25, 0.2, 0.65],
  Flute: [0.4, 0.3, 0.6],
  Frigate: [0.35, 0.28, 0.7],
  Galleon: [0.5, 0.35, 0.8],
};

const DEFAULT_GEOMETRY: [number, number, number] = [0.3, 0.25, 0.7];

export function Ship({
  position,
  color,
  shipClass,
  onPointerEnter,
  onPointerLeave,
  onClick,
  wrapWidth = Infinity,
  foamId,
  foamPlayer = false,
}: {
  position: [number, number, number];
  color: string;
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
  const ref = useRef<Mesh>(null!);
  const from = useMemo(() => new Vector3(), []);
  const to = useMemo(() => new Vector3(), []);
  const prevTarget = useRef<[number, number, number] | null>(null);
  const progressRef = useRef(1);
  const initialized = useRef(false);
  const targetYRotation = useRef(0);
  const foamPrevPosition = useRef<Vector3 | null>(null);
  const foamSpeed = useRef(0);
  const hullLength = (shipClass ? SHIP_GEOMETRY[shipClass] : DEFAULT_GEOMETRY)[2];

  useEffect(() => {
    if (!foamId) return;
    return () => shipFoamSources.remove(foamId);
  }, [foamId]);

  const meshRef = useCallback(
    (mesh: Mesh | null) => {
      if (!mesh) return;
      ref.current = mesh;
      if (!initialized.current) {
        mesh.position.set(position[0], position[1] + 0.12, position[2]);
        prevTarget.current = position;
        to.set(position[0], position[1] + 0.12, position[2]);
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
      to.set(position[0], position[1] + 0.12, position[2]);
      // Across the seam, sail straight over it rather than back across the map.
      from.setX(seamAwareStart(from.x, to.x, wrapWidth));
      prevTarget.current = position;
      if (from.distanceTo(to) > 0.001) {
        progressRef.current = 0;
        // Compute heading from movement direction (XZ plane)
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        targetYRotation.current = Math.atan2(dx, dz);
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

  return (
    <mesh
      ref={meshRef}
      castShadow
      receiveShadow
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
      <boxGeometry args={shipClass ? SHIP_GEOMETRY[shipClass] : DEFAULT_GEOMETRY} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export function SinkingShip({
  position,
  color,
  shipClass,
  onComplete,
}: {
  position: [number, number, number];
  color: string;
  shipClass?: ShipClass;
  onComplete: () => void;
}) {
  const ref = useRef<Mesh>(null!);
  const progressRef = useRef(0);
  const startY = position[1] + 0.12;
  const [opacity, setOpacity] = useState(1);
  const completedRef = useRef(false);

  useFrame((_, delta) => {
    if (!ref.current || completedRef.current) return;

    progressRef.current = Math.min(progressRef.current + delta / SINK_DURATION, 1);
    const t = smoothstep(progressRef.current);

    // Sink down
    ref.current.position.y = MathUtils.lerp(startY, startY - 1.5, t);

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

  return (
    <mesh
      ref={ref}
      position={[position[0], startY, position[2]]}
      castShadow
    >
      <boxGeometry args={shipClass ? SHIP_GEOMETRY[shipClass] : DEFAULT_GEOMETRY} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}
