import { useCallback, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, Mesh, MathUtils } from "three";
import type { ShipClass } from "../game/types";

const DURATION = 0.4; // seconds
const SINK_DURATION = 2.0; // seconds for sinking animation

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
}: {
  position: [number, number, number];
  color: string;
  shipClass?: ShipClass;
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

  const meshRef = useCallback(
    (mesh: Mesh | null) => {
      if (!mesh) return;
      ref.current = mesh;
      if (!initialized.current) {
        mesh.position.set(position[0], position[1] + 0.5, position[2]);
        prevTarget.current = position;
        to.set(position[0], position[1] + 0.5, position[2]);
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
      to.set(position[0], position[1] + 0.5, position[2]);
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

    if (progressRef.current >= 1) return;
    progressRef.current = Math.min(progressRef.current + delta / DURATION, 1);
    const t = smoothstep(progressRef.current);
    ref.current.position.lerpVectors(from, to, t);
  });

  return (
    <mesh
      ref={meshRef}
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
  const startY = position[1] + 0.5;
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
