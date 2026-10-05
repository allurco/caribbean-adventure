import { describe, expect, it } from "vitest";
import {
  accumulateWhitecap,
  surfaceJacobian,
  whitecapDecay,
  whitecapFold,
  whitecapInjection,
  WHITECAP_DECAY_SECONDS,
  WHITECAP_FOAM_GLSL,
  WHITECAP_FOLD_THRESHOLD,
  WHITECAP_GAIN,
} from "./whitecapFoam";
import { WAVE_CASCADES, WAVE_CHOPPINESS, WHITECAP_CASCADES } from "./oceanWaves";
import {
  cascadeWavenumber,
  evolvedAmplitude,
  evolvedStretchSpectrum,
  initialSpectrum,
  windInTile,
  type WaveCascade,
} from "./waveCascade";
import { inverseFft2d } from "./fftButterfly";
import { WAVE_LOOP_SECONDS } from "./waveClock";

describe("surfaceJacobian", () => {
  it("is 1 for an undisplaced surface", () => {
    expect(surfaceJacobian(0, 0)).toBe(1);
  });

  it("is the area scale of the displaced surface: (1 + ∂Du/∂u)(1 + ∂Dv/∂v) − (∂Du/∂v)²", () => {
    expect(surfaceJacobian(-0.5, 0.2)).toBeCloseTo(0.5 * 1.2, 12);
    expect(surfaceJacobian(-0.5, 0.2, 0.3)).toBeCloseTo(0.5 * 1.2 - 0.09, 12);
  });

  it("falls to 0 at a fold, where the surface is compressed to nothing along the wind", () => {
    expect(surfaceJacobian(-1, 0)).toBe(0);
  });
});

describe("whitecapFold", () => {
  it("is 0 wherever the surface is not compressed past the threshold", () => {
    expect(whitecapFold(1)).toBe(0);
    expect(whitecapFold(WHITECAP_FOLD_THRESHOLD)).toBe(0);
    expect(whitecapFold(1.3)).toBe(0);
  });

  it("grows with the compression past the threshold", () => {
    expect(whitecapFold(WHITECAP_FOLD_THRESHOLD - 0.1)).toBeCloseTo(0.1, 12);
    expect(whitecapFold(0)).toBeCloseTo(WHITECAP_FOLD_THRESHOLD, 12);
  });

  it("uses a threshold below 1, so only a compressed surface foams", () => {
    expect(WHITECAP_FOLD_THRESHOLD).toBeGreaterThan(0);
    expect(WHITECAP_FOLD_THRESHOLD).toBeLessThan(1);
  });
});

describe("accumulateWhitecap", () => {
  it("decays exponentially with the time constant once the fold has passed", () => {
    expect(accumulateWhitecap(0.8, 1, WHITECAP_DECAY_SECONDS)).toBeCloseTo(0.8 / Math.E, 9);
    expect(WHITECAP_DECAY_SECONDS).toBeGreaterThanOrEqual(3);
    expect(WHITECAP_DECAY_SECONDS).toBeLessThanOrEqual(10);
  });

  it("is frame-rate independent: two half steps equal one whole step under a steady fold", () => {
    const j = WHITECAP_FOLD_THRESHOLD - 0.05;
    const whole = accumulateWhitecap(0.1, j, 0.04);
    const halves = accumulateWhitecap(accumulateWhitecap(0.1, j, 0.02), j, 0.02);
    expect(halves).toBeCloseTo(whole, 12);
  });

  it("settles at gain × time constant × fold under a steady fold", () => {
    const j = WHITECAP_FOLD_THRESHOLD - 0.01;
    let foam = 0;
    for (let i = 0; i < 10000; i++) foam = accumulateWhitecap(foam, j, 0.01);
    expect(foam).toBeCloseTo(WHITECAP_GAIN * WHITECAP_DECAY_SECONDS * 0.01, 6);
  });

  it("never exceeds 1", () => {
    expect(accumulateWhitecap(0.99, 0, 1)).toBe(1);
    expect(accumulateWhitecap(1, 0, 0.001)).toBeLessThanOrEqual(1);
  });

  it("is unchanged by a zero step (frozen under reduced motion)", () => {
    expect(accumulateWhitecap(0.37, 0, 0)).toBe(0.37);
    expect(whitecapDecay(0)).toBe(1);
    expect(whitecapInjection(0)).toBe(0);
  });
});

describe("WHITECAP_FOAM_GLSL", () => {
  it("mirrors the constants and the Jacobian, fold and accumulation step", () => {
    expect(WHITECAP_FOAM_GLSL).toContain(`const float WHITECAP_FOLD_THRESHOLD = ${WHITECAP_FOLD_THRESHOLD.toFixed(4)};`);
    expect(WHITECAP_FOAM_GLSL).toContain("float surfaceJacobian(vec2 stretch)");
    expect(WHITECAP_FOAM_GLSL).toContain("return (1.0 + stretch.x) * (1.0 + stretch.y);");
    expect(WHITECAP_FOAM_GLSL).toContain("float whitecapFold(float jacobian)");
    expect(WHITECAP_FOAM_GLSL).toContain("float accumulateWhitecap(float previous, float jacobian, float decay, float injection)");
  });
});

/**
 * The shear ∂Du/∂v, which the GPU drops: spectrum −λ (k·u)(k·v) / |k| · h̃,
 * real, so it is transformed alone (the imaginary part comes out zero).
 */
function evolvedShear(initial: Float32Array, cascade: WaveCascade, seconds: number, choppiness: number): Float64Array {
  const { size, tileMetres } = cascade;
  const [ux, uz] = windInTile(cascade);
  const re = new Float64Array(size * size);
  const im = new Float64Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const kx = cascadeWavenumber(x, size, tileMetres);
      const kz = cascadeWavenumber(z, size, tileMetres);
      const k = Math.hypot(kx, kz);
      if (k === 0) continue;
      const t = (z * size + x) * 4;
      const [hr, hi] = evolvedAmplitude(initial.subarray(t, t + 4), k, seconds, WAVE_LOOP_SECONDS);
      const c = (-choppiness * (kx * ux + kz * uz) * (-kx * uz + kz * ux)) / k;
      re[z * size + x] = hr * c;
      im[z * size + x] = hi * c;
    }
  }
  return inverseFft2d(re, im, size).re;
}

/** Per-texel exact and shear-free Jacobians of `cascade` at wave time `seconds`. */
function jacobians(cascade: WaveCascade, seconds: number): { exact: Float64Array; approx: Float64Array } {
  const initial = initialSpectrum(cascade);
  const stretch = evolvedStretchSpectrum(initial, cascade, seconds, WAVE_LOOP_SECONDS, WAVE_CHOPPINESS);
  const field = inverseFft2d(stretch.re, stretch.im, cascade.size);
  const shear = evolvedShear(initial, cascade, seconds, WAVE_CHOPPINESS);
  const exact = new Float64Array(field.re.length);
  const approx = new Float64Array(field.re.length);
  for (let i = 0; i < exact.length; i++) {
    exact[i] = surfaceJacobian(field.re[i], field.im[i], shear[i]);
    approx[i] = surfaceJacobian(field.re[i], field.im[i]);
  }
  return { exact, approx };
}

const coverage = (j: Float64Array) => j.reduce((n, v) => n + (v < WHITECAP_FOLD_THRESHOLD ? 1 : 0), 0) / j.length;

describe("dropping the shear term for the trade-wind sea (option a, #38 step 7)", () => {
  // The GPU carries only the stretch along and across the wind; the shear
  // ∂Du/∂v would need a third real signal. The error in J is the shear
  // squared, which for a directionally spread wind sea measured in the wind
  // frame is small next to the along-wind stretch, which enters J linearly.
  const [, chop] = WAVE_CASCADES;
  const times = [0, 71.3, 190.7];
  const runs = times.map((t) => ({ t, ...jacobians(chop, t) }));

  it("changes the chop cascade's Jacobian by under 0.05 anywhere on the tile", () => {
    for (const { exact, approx } of runs) {
      let worst = 0;
      for (let i = 0; i < exact.length; i++) worst = Math.max(worst, Math.abs(exact[i] - approx[i]));
      expect(worst).toBeLessThan(0.05);
    }
  });

  it("changes the chop cascade's whitecap coverage by under a tenth of itself", () => {
    for (const { exact, approx } of runs) {
      const a = coverage(exact);
      const b = coverage(approx);
      expect(Math.abs(a - b)).toBeLessThan(0.1 * Math.max(a, b));
    }
  });

  it("gives the chop cascade a low coverage, a moderate sea's few white horses", () => {
    for (const { exact } of runs) {
      const c = coverage(exact);
      expect(c).toBeGreaterThan(0.001);
      expect(c).toBeLessThan(0.05);
    }
  });

  it("whitecaps the swell lightly and the chop most; the ripple does not whitecap", () => {
    const [swell, , ripple] = WAVE_CASCADES;
    expect(coverage(jacobians(swell, 0).exact)).toBeLessThan(coverage(runs[0].exact));
    expect(WHITECAP_CASCADES).toEqual([0, 1]);
    expect(WHITECAP_CASCADES).not.toContain(WAVE_CASCADES.indexOf(ripple));
  });
});

describe("WAVE_CHOPPINESS", () => {
  it("is a typical choppiness, 1 … 1.5", () => {
    expect(WAVE_CHOPPINESS).toBeGreaterThanOrEqual(1);
    expect(WAVE_CHOPPINESS).toBeLessThanOrEqual(1.5);
  });
});
