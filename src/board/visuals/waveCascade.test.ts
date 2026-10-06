import { describe, expect, it } from "vitest";
import {
  cascadeWavenumber,
  evolvedAmplitude,
  evolvedDisplacementSpectrum,
  evolvedSlopeSpectrum,
  evolvedStretchSpectrum,
  inCascadeBand,
  initialSpectrum,
  modeVariance,
  nyquistWavenumber,
  resolvedHeightVariance,
  resolvedSlopeVariance,
  windInTile,
  type WaveCascade,
} from "./waveCascade";
import { inverseFft2d } from "./fftButterfly";
import { jonswapSpectrum } from "./jonswap";
import { deepWaterFrequency } from "./waveDispersion";

const sea = { windSpeed: 10, fetch: 100_000, peakEnhancement: 3.3 };

const cascade = (overrides: Partial<WaveCascade> = {}): WaveCascade => ({
  sea,
  windAngle: 0,
  rotation: 0,
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

  it("sends the energy toward the world wind in a turned tile", () => {
    // The tile's +x axis points along world +z, and so does the wind: the
    // tile's own +x is down-wind.
    const c = cascade({ windAngle: Math.PI / 2, rotation: Math.PI / 2 });
    expect(modeVariance(0.06, 0, c)).toBeGreaterThan(5 * modeVariance(0, 0.06, c));
    expect(modeVariance(0.06, 0, c)).toBeCloseTo(modeVariance(0.06, 0, cascade()), 12);
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

describe("evolvedStretchSpectrum (choppy displacement derivatives, #38 step 7)", () => {
  // The same hand-made wave: amplitude 0.5 m along tile +x at mode 1 on a 16-texel tile.
  const n = 16;
  const tile = 160;
  const k = (2 * Math.PI) / tile;
  const single = new Float32Array(n * n * 4);
  single[1 * 4] = 0.25;
  single[(n - 1) * 4 + 2] = 0.25;
  const loop = 100;
  const choppiness = 1.2;

  const stretch = (c: WaveCascade) => {
    const s = evolvedStretchSpectrum(single, c, 0, loop, choppiness);
    return inverseFft2d(s.re, s.im, n);
  };

  it("packs the stretch along the wind (real) and across it (imaginary); a wave running with the wind compresses the surface at its crest", () => {
    // Wind toward tile +x. The choppy displacement pulls the surface toward
    // the crests (Gerstner): D = −λ a sin(kx), so ∂Dx/∂x = −λ a k cos(kx),
    // −λ a k at the crest and +λ a k in the trough.
    const out = stretch(cascade({ size: n, tileMetres: tile, windAngle: 0, rotation: 0 }));
    for (let x = 0; x < n; x++) {
      const px = (x * tile) / n;
      expect(out.re[x]).toBeCloseTo(-choppiness * 0.5 * k * Math.cos(k * px), 6);
      expect(out.im[x]).toBeCloseTo(0, 6);
    }
  });

  it("puts a cross-wind wave's stretch in the across part", () => {
    // Wind toward tile +z: the wave along tile +x runs across the wind.
    const out = stretch(cascade({ size: n, tileMetres: tile, windAngle: Math.PI / 2, rotation: 0 }));
    for (let x = 0; x < n; x++) {
      const px = (x * tile) / n;
      expect(out.re[x]).toBeCloseTo(0, 6);
      expect(out.im[x]).toBeCloseTo(-choppiness * 0.5 * k * Math.cos(k * px), 6);
    }
  });

  it("measures the stretch against the world wind, not the tile's axes", () => {
    // The tile is turned so its +x axis points along world +z, where the wind blows.
    const out = stretch(cascade({ size: n, tileMetres: tile, windAngle: Math.PI / 2, rotation: Math.PI / 2 }));
    expect(out.re[0]).toBeCloseTo(-choppiness * 0.5 * k, 6);
    expect(out.im[0]).toBeCloseTo(0, 6);
  });

  it("scales with the choppiness", () => {
    const c = cascade({ size: n, tileMetres: tile, windAngle: 0, rotation: 0 });
    const a = inverseFft2d(...spread(evolvedStretchSpectrum(single, c, 0, loop, 1)), n);
    const b = inverseFft2d(...spread(evolvedStretchSpectrum(single, c, 0, loop, 2)), n);
    for (let x = 0; x < n; x++) expect(b.re[x]).toBeCloseTo(2 * a.re[x], 9);
  });
});

const spread = (s: { re: Float64Array; im: Float64Array }): [Float64Array, Float64Array] => [s.re, s.im];

describe("evolvedDisplacementSpectrum (height and choppy displacement, #38 step 8)", () => {
  // The hand-made wave again: amplitude 0.5 m, one mode along tile +x on a 16-texel tile.
  const n = 16;
  const tile = 160;
  const k = (2 * Math.PI) / tile;
  const loop = 100;
  const choppiness = 1.2;
  const alongX = new Float32Array(n * n * 4);
  alongX[1 * 4] = 0.25;
  alongX[(n - 1) * 4 + 2] = 0.25;
  // The same wave along tile +z: modes (0, 1) and (0, n − 1).
  const alongZ = new Float32Array(n * n * 4);
  alongZ[(1 * n) * 4] = 0.25;
  alongZ[((n - 1) * n) * 4 + 2] = 0.25;
  const c = cascade({ size: n, tileMetres: tile });

  const fields = (initial: Float32Array) => {
    const s = evolvedDisplacementSpectrum(initial, c, 0, loop, choppiness);
    return { heightAndX: inverseFft2d(...spread(s.heightAndX), n), z: inverseFft2d(...spread(s.z), n) };
  };

  it("packs the height (real) with the x displacement (imaginary), and the z displacement alone", () => {
    // h = 0.5 cos(k x); the choppy displacement pulls the surface toward the
    // crests (Gerstner): Dx = −λ · 0.5 · sin(k x), and nothing along z.
    const out = fields(alongX);
    for (let x = 0; x < n; x++) {
      const px = (x * tile) / n;
      expect(out.heightAndX.re[x]).toBeCloseTo(0.5 * Math.cos(k * px), 6);
      expect(out.heightAndX.im[x]).toBeCloseTo(-choppiness * 0.5 * Math.sin(k * px), 6);
      expect(out.z.re[x]).toBeCloseTo(0, 6);
      expect(out.z.im[x]).toBeCloseTo(0, 6);
    }
  });

  it("displaces a wave along z along z only", () => {
    const out = fields(alongZ);
    for (let z = 0; z < n; z++) {
      const pz = (z * tile) / n;
      expect(out.heightAndX.re[z * n]).toBeCloseTo(0.5 * Math.cos(k * pz), 6);
      expect(out.heightAndX.im[z * n]).toBeCloseTo(0, 6);
      expect(out.z.re[z * n]).toBeCloseTo(-choppiness * 0.5 * Math.sin(k * pz), 6);
    }
  });

  it("does not depend on the wind: the pull is toward the crests whichever way they run", () => {
    const a = evolvedDisplacementSpectrum(alongX, c, 0, loop, choppiness);
    const b = evolvedDisplacementSpectrum(alongX, cascade({ size: n, tileMetres: tile, windAngle: 2 }), 0, loop, choppiness);
    expect(Array.from(a.heightAndX.re)).toEqual(Array.from(b.heightAndX.re));
    expect(Array.from(a.z.im)).toEqual(Array.from(b.z.im));
  });

  it("leaves the height alone when the choppiness is zero", () => {
    const s = evolvedDisplacementSpectrum(alongX, c, 0, loop, 0);
    const out = inverseFft2d(...spread(s.heightAndX), n);
    for (let x = 0; x < n; x++) expect(out.im[x]).toBeCloseTo(0, 6);
  });
});

describe("resolvedHeightVariance", () => {
  it("is the sum of the mode variances, E|h̃|² = 2 E|h0|² per mode", () => {
    const c = cascade({ size: 8, tileMetres: 100, kMin: 0.06, kMax: 0.07 });
    const dk = (2 * Math.PI) / 100;
    let expected = 0;
    for (const [kx, kz] of [[dk, 0], [-dk, 0], [0, dk], [0, -dk]]) expected += 2 * modeVariance(kx, kz, c);
    expect(resolvedHeightVariance(c)).toBeCloseTo(expected, 12);
  });

  it("matches the height variance ∫ S dω over the band's frequencies", () => {
    const c = cascade({ size: 256, tileMetres: 800 });
    const lo = deepWaterFrequency((2 * Math.PI) / c.tileMetres);
    const hi = deepWaterFrequency(c.kMax);
    const n = 20000;
    const h = (hi - lo) / n;
    let integral = 0;
    for (let i = 0; i < n; i++) integral += jonswapSpectrum(lo + (i + 0.5) * h, sea) * h;
    expect(resolvedHeightVariance(c) / integral).toBeCloseTo(1, 1);
  });
});

describe("windInTile", () => {
  it("is the world wind direction expressed in the tile's turned axes", () => {
    const [ux, uz] = windInTile(cascade({ windAngle: Math.PI / 2, rotation: Math.PI / 2 }));
    expect(ux).toBeCloseTo(1, 12);
    expect(uz).toBeCloseTo(0, 12);
    const [vx, vz] = windInTile(cascade({ windAngle: Math.PI, rotation: 0 }));
    expect(vx).toBeCloseTo(-1, 12);
    expect(vz).toBeCloseTo(0, 12);
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
