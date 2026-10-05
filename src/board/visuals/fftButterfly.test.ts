import { describe, expect, it } from "vitest";
import { butterflyTable, fftStageCount, inverseFft, inverseFft2d } from "./fftButterfly";

/** The table holds float32 twiddles (as the GPU texture does), so results match to ~1e-7. */
const DIGITS = 6;

/** Seeded uniform numbers in [−1, 1), so the tests are repeatable. */
const seeded = (seed: number) => {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return (a / 4294967296) * 2 - 1;
  };
};

/** Naive inverse DFT, x[m] = Σ X[k] e^(+2πi k m / N), no 1/N. */
const naiveInverse = (re: number[], im: number[]) => {
  const n = re.length;
  const outRe: number[] = [];
  const outIm: number[] = [];
  for (let m = 0; m < n; m++) {
    let sr = 0;
    let si = 0;
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k * m) / n;
      sr += re[k] * Math.cos(a) - im[k] * Math.sin(a);
      si += re[k] * Math.sin(a) + im[k] * Math.cos(a);
    }
    outRe.push(sr);
    outIm.push(si);
  }
  return { re: outRe, im: outIm };
};

describe("fftStageCount", () => {
  it("is log2 of the size", () => {
    expect(fftStageCount(8)).toBe(3);
    expect(fftStageCount(256)).toBe(8);
  });

  it("rejects sizes that are not a power of two", () => {
    expect(() => fftStageCount(12)).toThrow();
  });
});

describe("butterflyTable", () => {
  it("pairs each output of the first N = 8 stage with inputs j and j + N/2, twiddle ±1", () => {
    const t = butterflyTable(8);
    const first = Array.from({ length: 8 }, (_, o) => Array.from(t.slice(o * 4, o * 4 + 4)));
    expect(first).toEqual([
      [0, 4, 1, 0],
      [0, 4, -1, -0],
      [1, 5, 1, 0],
      [1, 5, -1, -0],
      [2, 6, 1, 0],
      [2, 6, -1, -0],
      [3, 7, 1, 0],
      [3, 7, -1, -0],
    ]);
  });

  it("uses the inverse twiddle e^(+iπ/2) = i in the second N = 4 stage", () => {
    // Stage 1 (Ns = 2), output 1: j = 1, r = 0, twiddle e^(+2πi·1/4) = i.
    const t = butterflyTable(4);
    const row = 1 * 4 * 4;
    expect(t[row + 4]).toBe(1); // input A
    expect(t[row + 5]).toBe(3); // input B
    expect(t[row + 6]).toBeCloseTo(0, 6);
    expect(t[row + 7]).toBeCloseTo(1, 6);
  });
});

describe("inverseFft (passes over the butterfly table)", () => {
  it("matches the naive inverse DFT for N = 16", () => {
    const rnd = seeded(7);
    const re = Array.from({ length: 16 }, rnd);
    const im = Array.from({ length: 16 }, rnd);
    const fast = inverseFft(Float64Array.from(re), Float64Array.from(im));
    const slow = naiveInverse(re, im);
    for (let m = 0; m < 16; m++) {
      expect(fast.re[m]).toBeCloseTo(slow.re[m], DIGITS);
      expect(fast.im[m]).toBeCloseTo(slow.im[m], DIGITS);
    }
  });
});

describe("inverseFft2d", () => {
  it("turns a single spectrum mode into a plane wave", () => {
    // X = 1 at (kx = 1, kz = 2) on an 8 × 8 grid gives e^(2πi(x + 2z)/8).
    const n = 8;
    const re = new Float64Array(n * n);
    const im = new Float64Array(n * n);
    re[2 * n + 1] = 1;
    const out = inverseFft2d(re, im, n);
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const a = (2 * Math.PI * (x + 2 * z)) / n;
        expect(out.re[z * n + x]).toBeCloseTo(Math.cos(a), DIGITS);
        expect(out.im[z * n + x]).toBeCloseTo(Math.sin(a), DIGITS);
      }
    }
  });

  it("maps a mode at index N − 1 to a negative wavenumber", () => {
    const n = 8;
    const re = new Float64Array(n * n);
    const im = new Float64Array(n * n);
    re[n - 1] = 1; // kx = −1
    const out = inverseFft2d(re, im, n);
    expect(out.im[1]).toBeCloseTo(Math.sin((-2 * Math.PI) / n), DIGITS);
  });
});
