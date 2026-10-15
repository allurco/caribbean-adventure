import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, Color, type InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import type { ParticlePool } from "./particlePool";
import { drawLiveInstances } from "./frameWriters";

const SPLINTER_COLOURS = ["#6b4a2b", "#8a6238", "#a37a4a", "#5a3d22", "#c9a46e"] as const;
const dummy = new Object3D();

/**
 * Splinters from the hits (#263): the pool's live splinters packed into the
 * instances, dead slots not drawn, and no shadow cast while there are none. They tumble through the air, then float on the
 * swell, rocking with it, and sink out of sight at the end of their life.
 */
export function DebrisLayer({ pool }: { pool: ParticlePool }) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({ geometry: new BoxGeometry(1, 1, 1), material: new MeshStandardMaterial({ roughness: 0.85, metalness: 0 }) }),
    []
  );
  // The colour buffer exists from the first frame, so the material's program never changes mid-fight
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

  const frame = useRef(0);
  const write = useMemo(() => {
    const colour = new Color();
    return (slot: number, index: number) => {
      const m = mesh.current;
      if (!m) return;
      const t = frame.current;
      const size = pool.size[slot];
      const floating = pool.state[slot] === 2;
      const seed = pool.seed[slot];
      const sinkAway = Math.max(0, (pool.age[slot] / pool.life[slot] - 0.9) / 0.1);
      dummy.scale.set(0.006 * size, 0.006 * size, (0.024 + 0.02 * seed) * size);
      dummy.position.set(pool.px[slot], pool.py[slot] - sinkAway * 0.02, pool.pz[slot]);
      dummy.rotation.set(
        floating ? 0.1 * Math.sin(t * 1.3 + seed * 9) : pool.rot[slot],
        seed * 6.28 + (floating ? 0 : pool.rot[slot] * 0.7),
        floating ? 0 : pool.rot[slot] * 0.4
      );
      dummy.updateMatrix();
      m.setMatrixAt(index, dummy.matrix);
      // Each splinter keeps its slot's colour wherever it is packed
      m.setColorAt(index, colour.set(SPLINTER_COLOURS[slot % SPLINTER_COLOURS.length]));
    };
  }, [pool]);
  const isLive = useMemo(() => (slot: number) => pool.state[slot] !== 0, [pool]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    frame.current = clock.elapsedTime;
    if (drawLiveInstances(m, pool.capacity, isLive, write, true) === 0) return;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geometry, material, pool.capacity]} count={0} visible={false} frustumCulled={false} />;
}
