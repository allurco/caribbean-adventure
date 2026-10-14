/**
 * Seeded streams and the hash the fixed mesh vocabulary uses. Pure.
 *
 * `stream` is the board's seeded PRNG: every world-seeded feature draws from
 * `stream(subSeed(G.mapSeed, feature, ...ids))` (`subSeed.ts`, ADR 0007).
 * `seedOf` is not world-seeded: it hashes a model's own numbers (a variant
 * index, a vertex position) for the shared models every map draws alike
 * (house wear, quay courses, vertex colour jitter), quantised so float noise
 * cannot change a vertex's hash. Nothing that varies by map may use it.
 */

/** Quantises a coordinate to an int so tiny float noise can't change the seed. */
const quantise = (v: number) => Math.round(v * 4096) | 0;

/** 32-bit integer mix (murmur3 finaliser). */
export function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A 32-bit seed from a list of numbers (quantised, so float noise doesn't matter),
 * for the fixed mesh vocabulary only; world-seeded features use `subSeed`.
 */
export function seedOf(values: readonly number[], salt = 0x9e3779b9): number {
  let h = salt >>> 0;
  for (const v of values) h = mix(h ^ quantise(v)) + 0x6d2b79f5;
  return mix(h);
}

/** mulberry32: a small seeded stream of numbers in [0, 1). */
export function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear interpolation over a [lo, hi] range. */
export const lerpRange = ([lo, hi]: readonly [number, number], t: number) => lo + (hi - lo) * t;
