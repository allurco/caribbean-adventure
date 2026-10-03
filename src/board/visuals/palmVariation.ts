/**
 * Per-palm variation (issue #14). Pure, no Three.js.
 *
 * Each palm's look is derived deterministically from its decoration data, so a
 * grove looks the same on every render and every client, but no two palms in
 * it are copies.
 */

/** Where a palm stands, after ground placement. */
export interface PalmPlacement {
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Decoration rotation (radians). */
  rotation: number;
  scale: number;
}

export interface PalmVariation {
  /** Vertical stretch on top of the decoration scale. */
  heightScale: number;
  /** Tilt (radians) towards the trunk's curve; negative straightens it a little. */
  lean: number;
  /** Turn about the vertical axis (radians): the direction the trunk curves. */
  yaw: number;
  /** Extra turn of the crown about the trunk top (radians), in [0, 2π). */
  crownTwist: number;
  /** Sway phase offset (radians), in [0, 2π). */
  phase: number;
}

export const PALM_HEIGHT_RANGE: readonly [number, number] = [0.8, 1.25];
export const PALM_LEAN_RANGE: readonly [number, number] = [-0.05, 0.3];

const TAU = Math.PI * 2;

/** Quantises a coordinate to an int so tiny float noise can't change the seed. */
const quantise = (v: number) => Math.round(v * 4096) | 0;

/** 32-bit integer mix (murmur3 finaliser). */
function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function seedOf(p: PalmPlacement): number {
  let h = 0x9e3779b9;
  for (const v of [p.worldX, p.worldZ, p.rotation, p.scale]) h = mix(h ^ quantise(v)) + 0x6d2b79f5;
  return mix(h);
}

/** mulberry32: a small seeded stream of numbers in [0, 1). */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = ([lo, hi]: readonly [number, number], t: number) => lo + (hi - lo) * t;

export function palmVariation(p: PalmPlacement): PalmVariation {
  const next = stream(seedOf(p));
  return {
    heightScale: lerp(PALM_HEIGHT_RANGE, next()),
    lean: lerp(PALM_LEAN_RANGE, next()),
    yaw: p.rotation,
    crownTwist: next() * TAU,
    phase: next() * TAU,
  };
}
