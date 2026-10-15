import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { type InstancedMesh, MeshStandardMaterial, Object3D, SphereGeometry } from "three";
import type { Shot } from "./combatDirector";

const dummy = new Object3D();

/** Round shot in flight (#263): one instance per shot slot, the idle ones at zero size. */
export function ShotLayer({ shots }: { shots: readonly Shot[] }) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({ geometry: new SphereGeometry(0.008, 8, 6), material: new MeshStandardMaterial({ color: "#1d1d1f", roughness: 0.5, metalness: 0.6 }) }),
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
      dummy.scale.setScalar(shot.active ? 1 : 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geometry, material, shots.length]} frustumCulled={false} />;
}
