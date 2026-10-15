/**
 * PROTOTYPE (combat animation lab): the per-frame writes into three.js
 * objects the lab's components hold (instance buffers, the topmast's pivot,
 * the sea reader), kept out of the components as plain functions.
 */
import type { Group, InstancedBufferAttribute, InstancedBufferGeometry, Vector3 } from "three";
import type { SeaSurface } from "../../board/visuals/seaSurface";
import { envelope, type ParticlePool, type SeaEnvironment } from "./particlePool";
import { shotArc, type Vec3 } from "./broadside";

/** The sea as the effects read it: the CPU swell at the wave clock's time, seen from the camera, and the wind's drift. */
export interface SeaReader {
  readonly env: SeaEnvironment;
  sync: (surface: SeaSurface, seconds: number, camera: Vector3) => void;
}

export function createSeaReader(driftX: number, driftZ: number): SeaReader {
  const eye: [number, number, number] = [0, 0, 0];
  let surface: SeaSurface | null = null;
  let seconds = 0;
  return {
    env: { windX: driftX, windZ: driftZ, seaHeight: (x, z) => (surface ? surface.heightAt(x, z, seconds, eye) : 0) },
    sync: (s, t, camera) => {
      surface = s;
      seconds = t;
      eye[0] = camera.x;
      eye[1] = camera.y;
      eye[2] = camera.z;
    },
  };
}

export interface PuffBuffers {
  offset: InstancedBufferAttribute;
  size: InstancedBufferAttribute;
  alpha: InstancedBufferAttribute;
  seed: InstancedBufferAttribute;
}

export interface PuffShape {
  opacity: number;
  grow: number;
  growSeconds: number;
  fadeIn: number;
  fadeOut: number;
}

/** Packs the pool's live particles into the instance buffers. */
export function writePuffs(pool: ParticlePool, look: PuffShape, buffers: PuffBuffers, geometry: InstancedBufferGeometry): void {
  const o = buffers.offset.array as Float32Array;
  const s = buffers.size.array as Float32Array;
  const a = buffers.alpha.array as Float32Array;
  const seed = buffers.seed.array as Float32Array;
  let n = 0;
  for (let i = 0; i < pool.capacity; i++) {
    if (pool.state[i] === 0) continue;
    o[3 * n] = pool.px[i];
    o[3 * n + 1] = pool.py[i];
    o[3 * n + 2] = pool.pz[i];
    s[n] = pool.size[i] * (1 + look.grow * (1 - Math.exp(-pool.age[i] / look.growSeconds)));
    a[n] = look.opacity * envelope(pool.age[i] / pool.life[i], look.fadeIn, look.fadeOut);
    seed[n] = pool.seed[i];
    n++;
  }
  geometry.instanceCount = n;
  buffers.offset.needsUpdate = buffers.size.needsUpdate = buffers.alpha.needsUpdate = buffers.seed.needsUpdate = true;
}

/** A point on a grapple's line at `u` (0 thrower, 1 hook): along the hook's arc while it flies (`s` < 1), then a sagging line. */
export function ropePoint(from: Vector3, to: Vector3, u: number, s: number, sag: number, scratch: Vec3, out: Vector3): void {
  if (s < 1) {
    shotArc(from, to, s * u, 0.06 * u, scratch);
    out.set(scratch.x, scratch.y, scratch.z);
    return;
  }
  out.lerpVectors(from, to, u);
  out.y -= sag * 4 * u * (1 - u);
}

/** Turns the topmast's pivot to the mast's fall (1 port, -1 starboard). */
export function poseTopmast(pivot: Group, mast: { side: 1 | -1; angle: number } | null): void {
  pivot.rotation.z = mast ? mast.side * mast.angle : 0;
}
