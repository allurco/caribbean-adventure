import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, Color, type InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import type { ParticlePool } from "./particlePool";

const SPLINTER_COLOURS = ["#6b4a2b", "#8a6238", "#a37a4a", "#5a3d22", "#c9a46e"] as const;
const dummy = new Object3D();

/**
 * Splinters from the hits (#263): one instance per slot of the pool, a dead
 * slot drawn at zero size. They tumble through the air, then float on the
 * swell, rocking with it, and sink out of sight at the end of their life.
 */
export function DebrisLayer({ pool }: { pool: ParticlePool }) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({ geometry: new BoxGeometry(1, 1, 1), material: new MeshStandardMaterial({ roughness: 0.85, metalness: 0 }) }),
    []
  );
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new Color();
    for (let i = 0; i < pool.capacity; i++) m.setColorAt(i, c.set(SPLINTER_COLOURS[i % SPLINTER_COLOURS.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [pool]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.state[i] === 0) {
        dummy.scale.setScalar(0);
      } else {
        const size = pool.size[i];
        const floating = pool.state[i] === 2;
        const seed = pool.seed[i];
        const sinkAway = Math.max(0, (pool.age[i] / pool.life[i] - 0.9) / 0.1);
        dummy.scale.set(0.006 * size, 0.006 * size, (0.024 + 0.02 * seed) * size);
        dummy.position.set(pool.px[i], pool.py[i] - sinkAway * 0.02, pool.pz[i]);
        dummy.rotation.set(
          floating ? 0.1 * Math.sin(t * 1.3 + seed * 9) : pool.rot[i],
          seed * 6.28 + (floating ? 0 : pool.rot[i] * 0.7),
          floating ? 0 : pool.rot[i] * 0.4
        );
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geometry, material, pool.capacity]} castShadow frustumCulled={false} />;
}
