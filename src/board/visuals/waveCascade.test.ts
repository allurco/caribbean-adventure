import { describe, expect, it } from "vitest";
import {
  cascadeWavenumber,
  evolvedAmplitude,
  evolvedSlopeSpectrum,
  inCascadeBand,
  initialSpectrum,
  modeVariance,
  nyquistWavenumber,
  resolvedSlopeVariance,
  type WaveCascade,
} from "./waveCascade";
import { inverseFft2d } from "./fftButterfly";
import { jonswapSpectrum } from "./jonswap";
import { deepWaterFrequency } from "./waveDispersion";

const sea = { windSpeed: 10, fetch: 100_000, peakEnhancement: 3.3 };

const cascade = (overrides: Partial<WaveCascade> = {}): WaveCascade => ({
  sea,
  windAngle: 0,
  tileMetres: 1000,
  size: 64,
  kMin: 0,
  kMax: nyquistWavenumber(64, 1000),
  seed: 1,
  ...overrides,
});

describe("cascadeWavenumber", () => {
  it("lays wavenumbers out in standard FFT order", () => {
    const step = (2 * Math.PI) / 100;
    expect(cascadeWavenumber(0, 8, 100)).toBe(0);
    expect(cascadeWavenumber(1, 8, 100)).toBeCloseTo(step, 12);
    expect(cascadeWavenumber(3, 8, 100)).toBeCloseTo(3 * step, 12);
    expect(cascadeWavenumber(4, 8, 100)).toBeCloseTo(-4 * step, 12);
    expect(cascadeWavenumber(7, 8, 100)).toBeCloseTo(-step, 12);
  });
});

describe("inCascadeBand", () => {
  const c = cascade({ kMin: 0.1, kMax: 0.5 });

  it("keeps kMin and drops kMax, so neighbouring bands never overlap", () => {
    expect(inCascadeBand(0.1, c)).toBe(true);
    expect(inCascadeBand(0.3, c)).toBe(true);
    expect(inCascadeBand(0.5, c)).toBe(false);
    expect(inCascadeBand(0.09, c)).toBe(false);
  });

  it("never carries the mean (k = 0)", () => {
    expect(inCascadeBand(0, cascade())).toBe(false);
  });

  it("drops the Nyquist row with the default band, keeping the field real", () => {
    expect(inCascadeBand(nyquistWavenumber(64, 1000), cascade())).toBe(false);
  });
});

describe("modeVariance (energy normalisation)", () => {
  it("sums over the grid to the spectrum's variance in the band", () => {
    // Height variance = Σ over modes of E|h̃|² = Σ 2·E|h0|², which must match
    // ∫ S(ω) dω between the band's frequencies (D integrates to 1 over θ).
    const c = cascade({ size: 256, tileMetres: 800 });
    let grid = 0;
    for (let z = 0; z < c.size; z++) {
      for (let x = 0; x < c.size; x++) {
        grid += 2 * modeVariance(cascadeWavenumber(x, c.size, c.tileMetres), cascadeWavenumber(z, c.size, c.tileMetres), c);
      }
    }
    const lo = deepWaterFrequency((2 * Math.PI) / c.tileMetres);
    const hi = deepWaterFrequency(c.kMax);
    const n = 20000;
    const h = (hi - lo) / n;
    let integral = 0;
    for (let i = 0; i < n; i++) integral += jonswapSpectrum(lo + (i + 0.5) * h, sea) * h;
    expect(grid / integral).toBeCloseTo(1, 1);
  });

  it("is zero outside the band", () => {
    const c = cascade({ kMin: 0.1, kMax: 0.2 });
    expect(modeVariance(0.3, 0, c)).toBe(0);
    expect(modeVariance(0.15, 0, c)).toBeGreaterThan(0);
  });

  it("carries more energy down-wind than cross-wind", () => {
    // Below the peak s ≈ 2.7 here, so cross-wind is cos(45°)^5.4 ≈ 0.15 of down-wind.
    const c = cascade({ windAngle: Math.PI / 2 }); // toward +z
    expect(modeVariance(0, 0.06, c)).toBeGreaterThan(5 * modeVariance(0.06, 0, c));
  });
});

describe("initialSpectrum", () => {
  it("stores h0(k) and conj(h0(−k)) per texel, consistently with the mirrored texel", () => {
    const c = cascade({ size: 16, tileMetres: 200 });
    const data = initialSpectrum(c);
    const at = (x: number, z: number) => ((z % 16) * 16 + (x % 16)) * 4;
    const i = at(3, 5);
    const mirror = at(16 - 3, 16 - 5);
    expect(data[i + 2]).toBeCloseTo(data[mirror], 6);
    expect(data[i + 3]).toBeCloseTo(-data[mirror + 1], 6);
  });

  it("is the same for the same seed and differs for another", () => {
    const c = cascade({ size: 16, tileMetres: 200 });
    expect(initialSpectrum(c)).toEqual(initialSpectrum(c));
    expect(initialSpectrum({ ...c, seed: 2 })).not.toEqual(initialSpectrum(c));
  });
});

describe("evolvedSlopeSpectrum", () => {
  // A hand-made spectrum: one wave of amplitude 0.5 m along +x at mode 1 on a 16-texel tile.
  const n = 16;
  const tile = 160;
  const c = cascade({ size: n, tileMetres: tile });
  const k = (2 * Math.PI) / tile;
  const single = new Float32Array(n * n * 4);
  single[1 * 4] = 0.25; // h0(k) at index (1, 0)
  single[(n - 1) * 4 + 2] = 0.25; // conj(h0(−(−k))) at index (n − 1, 0): the same wave
  const loop = 100;

  const slopes = (t: number) => {
    const s = evolvedSlopeSpectrum(single, c, t, loop);
    return inverseFft2d(s.re, s.im, n);
  };

  it("packs x and z slopes into the real and imaginary parts of one inverse FFT", () => {
    // h = 0.5 cos(k x) at t = 0, so ∂h/∂x = −0.5 k sin(k x) and ∂h/∂z = 0.
    const out = slopes(0);
    for (let x = 0; x < n; x++) {
      const px = (x * tile) / n;
      expect(out.re[x]).toBeCloseTo(-0.5 * k * Math.sin(k * px), 6);
      expect(out.im[x]).toBeCloseTo(0, 6);
    }
  });

  it("moves the crests down-wave (+x) as time passes", () => {
    // A quarter period on: h = 0.5 cos(k x − π/2) = 0.5 sin(k x), whose
    // slope at x = 0 is +0.5k (a crest that moved the other way gives −0.5k).
    const m = Math.round((deepWaterFrequency(k) * loop) / (2 * Math.PI));
    const quarter = loop / (4 * m);
    expect(slopes(quarter).re[0]).toBeCloseTo(0.5 * k, 6);
  });

  it("repeats exactly after one loop", () => {
    const a = slopes(12.3);
    const b = slopes(12.3 + loop);
    for (let i = 0; i < n; i++) expect(a.re[i]).toBeCloseTo(b.re[i], 4);
  });
});

describe("evolvedAmplitude", () => {
  it("is h0 + conj(h0(−k)) at t = 0", () => {
    expect(evolvedAmplitude([0.3, 0.1, 0.2, -0.4], 0.1, 0, 100)).toEqual([0.5, -0.30000000000000004]);
  });

  it("turns h0 by −φ and its mirror by +φ: a quarter turn for a quarter period", () => {
    // k with exactly 10 cycles per 100 s loop: ω = 2π/10, so k = ω²/g.
    const k = (2 * Math.PI / 10) ** 2 / 9.81;
    const [re, im] = evolvedAmplitude([1, 0, 0, 0], k, 2.5, 100);
    expect(re).toBeCloseTo(0, 9);
    expect(im).toBeCloseTo(-1, 9);
    const [re2, im2] = evolvedAmplitude([0, 0, 1, 0], k, 2.5, 100);
    expect(re2).toBeCloseTo(0, 9);
    expect(im2).toBeCloseTo(1, 9);
  });
});

describe("resolvedSlopeVariance", () => {
  it("grows as the band reaches shorter waves", () => {
    const coarse = cascade({ size: 256, kMax: 0.3 });
    const fine = cascade({ size: 256, kMax: 0.6 });
    expect(resolvedSlopeVariance(fine)).toBeGreaterThan(resolvedSlopeVariance(coarse));
  });

  it("is the k²-weighted sum of the mode variances", () => {
    // One-mode check: a band that holds only |k| = Δk along the axes.
    const c = cascade({ size: 8, tileMetres: 100, kMin: 0.06, kMax: 0.07 });
    const dk = (2 * Math.PI) / 100;
    let expected = 0;
    for (const [kx, kz] of [[dk, 0], [-dk, 0], [0, dk], [0, -dk]]) {
      expected += 2 * dk * dk * modeVariance(kx, kz, c);
    }
    expect(resolvedSlopeVariance(c)).toBeCloseTo(expected, 12);
  });
});
