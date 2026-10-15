import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ConeGeometry, CylinderGeometry, type InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Vector3 } from "three";
import type { CombatDirector } from "./combatDirector";
import { ropePoint } from "./frameWriters";
import { shotArc, type Vec3 } from "./broadside";

const ROPE_SEGMENTS = 10;
/** The line's radius, world units: thick enough to read as a rope at ship zoom. */
const ROPE_RADIUS = 0.0035;
const UP = new Vector3(0, 1, 0);
const dummy = new Object3D();

/**
 * The grapples (#263): an iron hook flying on its line from the thrower's
 * rail to the target's, then the line hauled taut between the ships, a
 * little sag left. Pale hemp against the sea, so the lines read as lines.
 */
export function GrappleLayer({ director }: { director: CombatDirector }) {
  const ropes = useRef<InstancedMesh>(null);
  const hooks = useRef<InstancedMesh>(null);
  const count = director.grapples.length;
  const parts = useMemo(
    () => ({
      rope: new CylinderGeometry(ROPE_RADIUS, ROPE_RADIUS, 1, 5, 1, true),
      ropeMaterial: new MeshStandardMaterial({ color: "#d9c79a", roughness: 0.9, emissive: "#3a2f1a" }),
      hook: new ConeGeometry(0.01, 0.022, 4),
      hookMaterial: new MeshStandardMaterial({ color: "#2a2724", roughness: 0.5, metalness: 0.6 }),
    }),
    []
  );
  useEffect(
    () => () => {
      parts.rope.dispose();
      parts.ropeMaterial.dispose();
      parts.hook.dispose();
      parts.hookMaterial.dispose();
    },
    [parts]
  );
  const scratch = useMemo(
    () => ({ from: new Vector3(), to: new Vector3(), hook: new Vector3(), a: new Vector3(), b: new Vector3(), dir: new Vector3(), arc: { x: 0, y: 0, z: 0 } as Vec3, ma: new Matrix4(), mb: new Matrix4() }),
    []
  );

  useFrame(() => {
    const r = ropes.current;
    const h = hooks.current;
    if (!r || !h) return;
    const { from, to, hook, a, b, dir, arc, ma, mb } = scratch;
    const pair = director.grappling;
    const placed = pair !== null && director.shipMatrix(pair.from, ma) && director.shipMatrix(pair.to, mb);
    const time = director.time();
    for (let gi = 0; gi < count; gi++) {
      const g = director.grapples[gi];
      const s = (time - g.throwAt) / g.flight;
      const shown = placed && g.active && s >= 0;
      if (shown) {
        from.set(g.from.x, g.from.y, g.from.z).applyMatrix4(ma);
        to.set(g.to.x, g.to.y, g.to.z).applyMatrix4(mb);
        if (s < 1) {
          shotArc(from, to, s, 0.06, arc);
          hook.set(arc.x, arc.y, arc.z);
        } else hook.copy(to);
      }
      dummy.rotation.set(0, 0, 0);
      dummy.position.copy(hook);
      dummy.scale.setScalar(shown ? 1 : 0);
      dummy.updateMatrix();
      h.setMatrixAt(gi, dummy.matrix);
      // Slack while it flies (the line follows the hook's arc), then hauled in, a little sag left.
      const sag = s < 1 ? 0 : 0.01 + 0.025 * Math.exp(-(s - 1) * 2);
      for (let k = 0; k < ROPE_SEGMENTS; k++) {
        const index = gi * ROPE_SEGMENTS + k;
        if (!shown) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          r.setMatrixAt(index, dummy.matrix);
          continue;
        }
        ropePoint(from, to, k / ROPE_SEGMENTS, s, sag, arc, a);
        ropePoint(from, to, (k + 1) / ROPE_SEGMENTS, s, sag, arc, b);
        dir.subVectors(b, a);
        const length = dir.length();
        dummy.position.addVectors(a, b).multiplyScalar(0.5);
        dummy.quaternion.setFromUnitVectors(UP, length > 1e-9 ? dir.multiplyScalar(1 / length) : UP);
        dummy.scale.set(1, length, 1);
        dummy.updateMatrix();
        r.setMatrixAt(index, dummy.matrix);
      }
    }
    r.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={ropes} args={[parts.rope, parts.ropeMaterial, count * ROPE_SEGMENTS]} frustumCulled={false} />
      <instancedMesh ref={hooks} args={[parts.hook, parts.hookMaterial, count]} frustumCulled={false} />
    </>
  );
}
