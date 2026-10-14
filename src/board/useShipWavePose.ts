import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { HullBox } from "./shipHull";
import { ZERO_WAVE_POSE, shipWavePose, wavePoseRotation, type WavePose } from "./shipWavePose";
import { SHIP_POSE_PRIORITY } from "./visuals/frameOrder";
import { useSeaSurface } from "./visuals/seaSurfaceContext";

/**
 * Sets a ship's wave pose (shipWavePose.ts, #142) each frame on its inner
 * group, the one the returned ref is put on: heave as the group's height,
 * pitch and roll as its tilt. The inner group sits in the group that sails and turns, which sits in its copy of the
 * wrapping world. The sea is sampled where this copy is drawn: the copy's
 * offset plus the ship's position, read directly rather than through
 * matrixWorld, which still holds last frame's copy offset when the copies
 * move by a wrap width (the swell does not repeat over the map's width). Runs
 * after the copies move and the ship sails (SHIP_POSE_PRIORITY). Outside a
 * sea surface provider the ship sits level.
 */
export function useShipWavePose(hull: HullBox): RefObject<Group | null> {
  const inner = useRef<Group>(null);
  const sea = useSeaSurface();
  useFrame(({ camera }) => {
    const group = inner.current;
    const ship = group?.parent;
    if (!group || !ship) return;
    let pose: WavePose = ZERO_WAVE_POSE;
    if (sea) {
      const copy = ship.parent;
      const x = (copy?.position.x ?? 0) + ship.position.x;
      const z = (copy?.position.z ?? 0) + ship.position.z;
      const seconds = sea.clock.waveTimeAt();
      const eye = [camera.position.x, camera.position.y, camera.position.z] as const;
      pose = shipWavePose((px, pz) => sea.surface.heightAt(px, pz, seconds, eye), hull, x, z, ship.rotation.y);
    }
    group.position.y = pose.heave;
    group.rotation.set(...wavePoseRotation(pose));
  }, SHIP_POSE_PRIORITY);
  return inner;
}
