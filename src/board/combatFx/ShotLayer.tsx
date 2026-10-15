import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { type InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3 } from "three";
import type { Shot } from "./combatDirector";

/**
 * A round shot's radius, world units: drawn larger than true scale (a 24 lb
 * ball is about 15 cm) like the ships themselves (ADR 0006), so it reads at
 * the game camera's distance.
 */
const SHOT_RADIUS = 0.013;
/** How long the faint motion streak draws a ball along its flight, as a multiple of its width. */
const SHOT_STREAK = 1.8;

const dummy = new Object3D();
const ALONG = new Vector3(0, 0, 1);
const flight = new Vector3();

/**
 * Round shot in flight (#263): solid black iron, unlit, so neither the sea's
 * glare nor the bloom can wash it out, drawn a little long along its flight.
 * One instance per shot slot, the idle ones at zero size.
 */
export function ShotLayer({ shots }: { shots: readonly Shot[] }) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({ geometry: new SphereGeometry(SHOT_RADIUS, 10, 8), material: new MeshBasicMaterial({ color: "#0b0b0c", toneMapped: false }) }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      dummy.position.copy(shot.pos);
      if (shot.active) {
        flight.subVectors(shot.to, shot.from);
        if (flight.lengthSq() > 1e-12) dummy.quaternion.setFromUnitVectors(ALONG, flight.normalize());
        dummy.scale.set(1, 1, SHOT_STREAK);
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geometry, material, shots.length]} frustumCulled={false} />;
}
