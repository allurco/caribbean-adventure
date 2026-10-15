/**
 * The per-frame writes into the three.js objects the combat effects hold
 * (#263): the sea reader, the instance buffers, the grapple lines, kept out
 * of the components as plain functions. None allocates.
 */
import type { InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Vector3 } from "three";
import type { SeaSurface } from "../visuals/seaSurface";
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

/**
 * A world XZ direction as the camera sees it: the unit screen-space (view x,
 * y) direction of (x, 0, z) under the view matrix `view` (the camera's
 * world inverse), written to `out`. A direction seen end on gives (1, 0).
 */
export function viewAxis(x: number, z: number, view: Matrix4, out: [number, number]): void {
  const e = view.elements;
  const vx = e[0] * x + e[8] * z;
  const vy = e[1] * x + e[9] * z;
  const length = Math.hypot(vx, vy);
  if (length < 1e-6) {
    out[0] = 1;
    out[1] = 0;
    return;
  }
  out[0] = vx / length;
  out[1] = vy / length;
}

/** Writes a number into a shader uniform, kept out of the components (their hooks own the material). */
export function writeUniform(uniform: { value: number }, value: number): void {
  uniform.value = value;
}
