import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { type InstancedMesh, MeshStandardMaterial, Object3D, SphereGeometry, Vector3 } from "three";
import type { Shot } from "./combatDirector";
import type { PuffZoom } from "./PuffLayer";
import { SHOT_IRON } from "./fxTuning";
import { drawLiveInstances } from "./frameWriters";

const dummy = new Object3D();
const ALONG = new Vector3(0, 0, 1);
const flight = new Vector3();

/**
 * Round shot in flight (#263): near-black iron lit by the scene's own sun,
 * with one small dim glint that stays under the bloom (fxTuning.ts), drawn
 * a little long along its flight and larger as the camera zooms out. The
 * shots in flight are packed into the instances; idle slots are not drawn.
 */
export function ShotLayer({ shots, zoom, warm }: { shots: readonly Shot[]; zoom: PuffZoom; warm: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({
      geometry: new SphereGeometry(SHOT_IRON.radius, 12, 10),
      material: new MeshStandardMaterial({
        color: SHOT_IRON.colour,
        metalness: SHOT_IRON.metalness,
        roughness: SHOT_IRON.roughness,
        envMapIntensity: SHOT_IRON.envMapIntensity,
      }),
    }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  const write = useMemo(
    () => (slot: number, index: number) => {
      const m = mesh.current;
      if (!m) return;
      const shot = shots[slot];
      dummy.position.copy(shot.pos);
      flight.subVectors(shot.to, shot.from);
      if (flight.lengthSq() > 1e-12) dummy.quaternion.setFromUnitVectors(ALONG, flight.normalize());
      dummy.scale.set(zoom.scale, zoom.scale, zoom.scale * SHOT_IRON.streak);
      dummy.updateMatrix();
      m.setMatrixAt(index, dummy.matrix);
    },
    [shots, zoom]
  );
  const isLive = useMemo(() => (slot: number) => shots[slot].active, [shots]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    if (drawLiveInstances(m, shots.length, isLive, write, { warm }) > 0) m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geometry, material, shots.length]} count={0} visible={warm} frustumCulled={false} />;
}
