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

/** Packs the pool's live particles into the instance buffers; returns how many. */
export function writePuffs(pool: ParticlePool, look: PuffShape, buffers: PuffBuffers, geometry: InstancedBufferGeometry): number {
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
  return n;
}

/** The parts of an instanced mesh that say what it draws. */
export interface InstanceTarget {
  count: number;
  visible: boolean;
  castShadow: boolean;
}

/** How a layer is drawn when it shows its instances. */
export interface ShowOptions {
  /** It casts shadows when it has something to cast. */
  castsShadow?: boolean;
  /**
   * The loading gate is still open: an empty layer stays in the scene (count
   * 0, casting its shadow if it would), so `compileAsync` and the counted
   * frames build its programs, the shadow-depth one too, behind the loading
   * screen instead of on the first frame of the first fight.
   */
  warm?: boolean;
}

/**
 * Draws the first `n` instances of `target` and no others: hidden when `n`
 * is 0 (unless `warm`), and casting shadows only when it `castsShadow` and is
 * drawn. Idle slots are never drawn (not even at zero size, whose singular
 * matrices some drivers rasterise or light as NaN).
 */
export function showInstances(target: InstanceTarget, n: number, options: ShowOptions = {}): void {
  target.count = n;
  showLayer(target, n, options);
}

/** `showInstances` for a layer whose count lives elsewhere (a puff pool's geometry): only whether it is drawn. */
export function showLayer(target: Omit<InstanceTarget, "count">, n: number, { castsShadow = false, warm = false }: ShowOptions = {}): void {
  const shown = n > 0 || warm;
  target.visible = shown;
  target.castShadow = castsShadow && shown;
}

/**
 * Packs the live slots of `slots` at the front of `target`: `write(slot,
 * index)` for each slot `isLive`, in order, then draws only those
 * (`showInstances`). Returns how many.
 */
export function drawLiveInstances(
  target: InstanceTarget,
  slots: number,
  isLive: (slot: number) => boolean,
  write: (slot: number, index: number) => void,
  options: ShowOptions = {}
): number {
  let n = 0;
  for (let slot = 0; slot < slots; slot++) {
    if (!isLive(slot)) continue;
    write(slot, n);
    n++;
  }
  showInstances(target, n, options);
  return n;
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
