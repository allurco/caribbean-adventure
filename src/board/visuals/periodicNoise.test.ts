import { describe, expect, it } from "vitest";
import { createPlaneNoise } from "./periodicNoise";

/** Seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERIOD = 36; // the small map's world width (24 columns × 1.5)
const FREQUENCIES = [0.7, 1.3, 2.73];

describe("createPlaneNoise", () => {
  it("is deterministic for a seed, periodic or not", () => {
    for (const period of [null, PERIOD]) {
      const a = createPlaneNoise(mulberry32(5), period);
      const b = createPlaneNoise(mulberry32(5), period);
      for (let i = 0; i < 50; i++) expect(a(i * 0.37, i * 0.91, 1.3)).toBe(b(i * 0.37, i * 0.91, 1.3));
    }
  });

  it("stays within [-1, 1]", () => {
    const noise = createPlaneNoise(mulberry32(9), PERIOD);
    const rng = mulberry32(1);
    for (let i = 0; i < 2000; i++) {
      const v = noise(rng() * 100 - 50, rng() * 100 - 50, 1.3, 17.3, -5.7);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it("repeats every period in x when periodic", () => {
    const noise = createPlaneNoise(mulberry32(3), PERIOD);
    const rng = mulberry32(2);
    for (let i = 0; i < 200; i++) {
      const x = rng() * PERIOD;
      const z = rng() * 60;
      for (const f of FREQUENCIES) {
        const v = noise(x, z, f, 31.7, -17.9);
        expect(noise(x + PERIOD, z, f, 31.7, -17.9)).toBeCloseTo(v, 9);
        expect(noise(x - 3 * PERIOD, z, f, 31.7, -17.9)).toBeCloseTo(v, 9);
      }
    }
  });

  it("does not repeat in x when not periodic", () => {
    const noise = createPlaneNoise(mulberry32(3), null);
    let differs = 0;
    for (let i = 0; i < 20; i++) if (Math.abs(noise(i, 4, 1.3) - noise(i + PERIOD, 4, 1.3)) > 1e-3) differs++;
    expect(differs).toBeGreaterThan(15);
  });

  it("has no seam: just below x = period it meets the value at x = 0", () => {
    for (const period of [PERIOD, 75]) {
      const noise = createPlaneNoise(mulberry32(11), period);
      for (const f of FREQUENCIES) {
        for (let z = 0; z < 30; z += 1.3) {
          expect(Math.abs(noise(0, z, f, 17.3) - noise(period - 1e-6, z, f, 17.3))).toBeLessThan(1e-4);
        }
      }
    }
  });

  it("keeps its feature size: periodic noise varies about as fast as plain noise", () => {
    // Mean absolute step over a fixed distance, which scales with the frequency.
    const meanStep = (period: number | null, f: number) => {
      const noise = createPlaneNoise(mulberry32(21), period);
      let sum = 0;
      let n = 0;
      for (let z = 0; z < 30; z += 1.7) {
        for (let x = 0; x < PERIOD; x += 0.05) {
          sum += Math.abs(noise(x + 0.05, z, f) - noise(x, z, f));
          n++;
        }
      }
      return sum / n;
    };
    for (const f of FREQUENCIES) {
      const ratio = meanStep(PERIOD, f) / meanStep(null, f);
      expect(ratio).toBeGreaterThan(0.75);
      expect(ratio).toBeLessThan(1.33);
    }
  });
});
