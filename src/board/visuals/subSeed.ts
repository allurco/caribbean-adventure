/**
 * Named sub-seeds of the world seed (ADR 0007). Pure.
 *
 * Every seeded visual feature draws from its own stream,
 * `stream(subSeed(G.mapSeed, "feature", ...ids))`, keyed by a feature name and
 * stable ids (an island, port or cell id from `islands.ts`, then an index
 * within it). A feature's seed depends on its own arguments only, so adding,
 * removing or reordering another feature never reshuffles it.
 *
 * Arguments are hashed whole: strings by every UTF-16 code unit, numbers as
 * 32-bit integers (no quantisation, so a seed keeps its top bits). Each
 * argument is tagged with its kind and length, so `("ab", "c")` and
 * `("a", "bc")`, or `12` and `"12"`, never meet.
 */
export { stream } from "./variationStream";

/**
 * The world seed of a match: `G.mapSeed`, which `setup()` always sets. Hand-built
 * states (tests) may leave it out, and then draw the world of seed 0.
 */
export const worldSeedOf = (state: { mapSeed?: number }): number => state.mapSeed ?? 0;

/** A stable id in a sub-seed: a string key, or a 32-bit integer (signed or unsigned). */
export type SeedId = string | number;

const INT32_MIN = -(2 ** 31);
const UINT32_MAX = 2 ** 32 - 1;

const TAG_INT = 0x1b873593;
const TAG_STRING = 0x5bd1e995;

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;

const rotl = (x: number, r: number): number => (x << r) | (x >>> (32 - r));

/** One murmur3 block: folds a 32-bit word into the running hash. */
function absorb(h: number, word: number): number {
  let k = Math.imul(word, C1);
  k = rotl(k, 15);
  k = Math.imul(k, C2);
  h ^= k;
  h = rotl(h, 13);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}

/** murmur3's finaliser: every input bit reaches every output bit. */
function finalise(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function checkInteger(value: number): number {
  if (!Number.isInteger(value) || value < INT32_MIN || value > UINT32_MAX) {
    throw new Error(`subSeed hashes 32-bit integers whole; got ${value}`);
  }
  return value | 0;
}

/** The words an argument contributes: its kind, then its value (strings with their length first). */
function absorbArgument(h: number, value: SeedId): { h: number; words: number } {
  if (typeof value === "number") {
    return { h: absorb(absorb(h, TAG_INT), checkInteger(value)), words: 2 };
  }
  let next = absorb(absorb(h, TAG_STRING), value.length);
  for (let i = 0; i < value.length; i++) next = absorb(next, value.charCodeAt(i));
  return { h: next, words: 2 + value.length };
}

/**
 * The seed of `feature` for the thing `ids` name, in the world `worldSeed`:
 * a 32-bit unsigned integer for `stream`. Throws on a number that is not a
 * 32-bit integer, rather than silently folding it onto another.
 */
export function subSeed(worldSeed: number, feature: string, ...ids: readonly SeedId[]): number {
  let h = absorb(0, checkInteger(worldSeed));
  let words = 1;
  for (const arg of [feature, ...ids]) {
    const next = absorbArgument(h, arg);
    h = next.h;
    words += next.words;
  }
  return finalise(h ^ words);
}
