import { describe, expect, it } from "vitest";
import { stream, subSeed } from "./subSeed";

/** Number of set bits in a 32-bit value. */
const popcount = (v: number): number => {
  let n = v >>> 0;
  let count = 0;
  while (n) {
    count += n & 1;
    n >>>= 1;
  }
  return count;
};

/** Mean number of output bits that change between pairs of seeds. */
const meanFlippedBits = (pairs: readonly (readonly [number, number])[]): number =>
  pairs.reduce((sum, [a, b]) => sum + popcount(a ^ b), 0) / pairs.length;

/** Over many pairs, how often each of the 32 output bits flipped (0..1). */
const perBitFlipRate = (pairs: readonly (readonly [number, number])[]): number[] => {
  const counts = new Array<number>(32).fill(0);
  for (const [a, b] of pairs) {
    const diff = (a ^ b) >>> 0;
    for (let bit = 0; bit < 32; bit++) if ((diff >>> bit) & 1) counts[bit]++;
  }
  return counts.map((c) => c / pairs.length);
};

const SAMPLES = 2000;
const indices = Array.from({ length: SAMPLES }, (_, i) => i);

/** Avalanche: about half of the 32 output bits change, and every bit flips about half the time. */
const expectAvalanche = (pairs: readonly (readonly [number, number])[]) => {
  expect(meanFlippedBits(pairs)).toBeGreaterThan(15);
  expect(meanFlippedBits(pairs)).toBeLessThan(17);
  for (const rate of perBitFlipRate(pairs)) {
    expect(rate).toBeGreaterThan(0.42);
    expect(rate).toBeLessThan(0.58);
  }
};

describe("subSeed", () => {
  it("is deterministic: the same arguments always give the same 32-bit unsigned seed", () => {
    const a = subSeed(1234, "archetype", "3,-1");
    expect(subSeed(1234, "archetype", "3,-1")).toBe(a);
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 ** 32);
  });

  it("avalanches on the world seed (one bit flipped)", () => {
    const pairs = indices.map((i) => {
      const seed = (i * 2654435761) | 0;
      const bit = i % 32;
      return [subSeed(seed, "palms", 7), subSeed(seed ^ (1 << bit), "palms", 7)] as const;
    });
    expectAvalanche(pairs);
  });

  it("avalanches on an integer id (one bit flipped)", () => {
    const pairs = indices.map((i) => {
      const id = (i * 40503) | 0;
      const bit = i % 32;
      return [subSeed(42, "rowboat", id), subSeed(42, "rowboat", id ^ (1 << bit))] as const;
    });
    expectAvalanche(pairs);
  });

  it("avalanches on a string id (one character changed)", () => {
    const pairs = indices.map((i) => {
      const id = `${i},${-i}`;
      const changed = `${i},${-i - 1}`;
      return [subSeed(42, "village", id), subSeed(42, "village", changed)] as const;
    });
    expectAvalanche(pairs);
  });

  it("avalanches on the feature name (one character changed)", () => {
    const pairs = indices.map((i) => {
      const id = `${i % 50},${Math.floor(i / 50)}`;
      return [subSeed(i, "cranes", id), subSeed(i, "cranez", id)] as const;
    });
    expectAvalanche(pairs);
  });

  it("has no collisions over a large sample of integer ids", () => {
    const seen = new Set<number>();
    for (let id = 0; id < 200_000; id++) seen.add(subSeed(7, "cell", id));
    expect(seen.size).toBe(200_000);
  });

  it("has no collisions over every hex key of a large grid, for several features", () => {
    const seen = new Set<number>();
    let count = 0;
    for (const feature of ["archetype", "palms", "village"]) {
      for (let q = 0; q < 60; q++) {
        for (let r = -60; r < 0; r++) {
          seen.add(subSeed(31337, feature, `${q},${r}`));
          count++;
        }
      }
    }
    expect(seen.size).toBe(count);
  });

  it("keeps a seed's top bits: seeds above 2^20 that differ only there give different sub-seeds", () => {
    // The old seedOf quantised by 4096, so two seeds 2^20 apart could alias.
    for (let bit = 20; bit < 32; bit++) {
      const high = (1 << bit) | 5;
      expect(subSeed(high, "palms", 0)).not.toBe(subSeed(5, "palms", 0));
    }
    expect(subSeed(2 ** 31 - 1, "palms", 0)).not.toBe(subSeed(2 ** 31 - 1 - 2 ** 20, "palms", 0));
  });

  it("separates the feature from the ids, and the ids from each other", () => {
    // No concatenation ambiguity: "ab" + "c" is not "a" + "bc".
    expect(subSeed(1, "ab", "c")).not.toBe(subSeed(1, "a", "bc"));
    expect(subSeed(1, "f", "ab", "c")).not.toBe(subSeed(1, "f", "a", "bc"));
    // An integer id is not its decimal string.
    expect(subSeed(1, "f", 12)).not.toBe(subSeed(1, "f", "12"));
    // Adding an id changes the seed; so does the order of ids.
    expect(subSeed(1, "f", 3)).not.toBe(subSeed(1, "f", 3, 0));
    expect(subSeed(1, "f", 3, 4)).not.toBe(subSeed(1, "f", 4, 3));
    expect(subSeed(1, "f")).not.toBe(subSeed(1, "f", ""));
  });

  it("gives each feature its own seed, unaffected by which other features exist", () => {
    // A feature's seed is a function of its own arguments only, so adding or removing
    // another feature cannot reshuffle it: computing other features first changes nothing.
    const before = subSeed(99, "waterfalls", "4,-2");
    const features = ["archetype", "palms", "village", "cranes", "gulls", "smoke"];
    const others = features.map((f) => subSeed(99, f, "4,-2"));
    expect(subSeed(99, "waterfalls", "4,-2")).toBe(before);
    expect(new Set([...others, before]).size).toBe(features.length + 1);
  });

  it("hashes a 32-bit integer whole: the signed and unsigned spellings of one bit pattern agree", () => {
    expect(subSeed(-1, "f", -2)).toBe(subSeed(0xffffffff, "f", 0xfffffffe));
  });

  it("rejects numbers it cannot hash whole", () => {
    expect(() => subSeed(1.5, "f")).toThrow();
    expect(() => subSeed(1, "f", 2 ** 32)).toThrow();
    expect(() => subSeed(1, "f", -(2 ** 31) - 1)).toThrow();
    expect(() => subSeed(Number.NaN, "f")).toThrow();
  });
});

describe("stream", () => {
  it("is a seeded PRNG in [0, 1): the same seed replays the same numbers", () => {
    const seed = subSeed(5, "palms", "1,1");
    const a = stream(seed);
    const b = stream(seed);
    const first = Array.from({ length: 100 }, () => a());
    expect(Array.from({ length: 100 }, () => b())).toEqual(first);
    for (const v of first) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("gives different streams for different sub-seeds", () => {
    const a = stream(subSeed(5, "palms", "1,1"));
    const b = stream(subSeed(5, "rocks", "1,1"));
    const first = Array.from({ length: 8 }, () => a());
    expect(Array.from({ length: 8 }, () => b())).not.toEqual(first);
  });
});
