import { describe, expect, it } from "vitest";
import { refractedDirection } from "./waterOptics";
import {
  CAUSTIC_DEPTH_FADE_WAVELENGTHS,
  CAUSTIC_FOCUS_GLSL,
  CAUSTIC_KNEE,
  CAUSTIC_LOD_BIAS,
  CAUSTIC_LOD_TEXELS,
  CAUSTIC_MIN_WAVE_TEXELS,
  CAUSTIC_STEP_SCALE,
  causticDepthFade,
  causticIntensity,
  causticJacobianDeterminant,
  causticLodFade,
  hessianFromSlopeDifferences,
  refractedSunTravel,
  refractionFocusMatrix,
} from "./causticFocus";
import { WAVE_CASCADES } from "./oceanWaves";

const WATER_IOR = 1.333;
const DEG = Math.PI / 180;

/** Unit vector toward a sun `elevationDeg` above the horizon at `azimuthDeg` from +x toward +z. */
const sunAt = (elevationDeg: number, azimuthDeg: number): [number, number, number] => [
  Math.cos(elevationDeg * DEG) * Math.cos(azimuthDeg * DEG),
  Math.sin(elevationDeg * DEG),
  Math.cos(elevationDeg * DEG) * Math.sin(azimuthDeg * DEG),
];

/**
 * Independent reference: horizontal travel per unit depth of the sun's ray
 * refracted through a facet of slope `s`, straight from vector Snell.
 */
function travelThroughFacet(sun: readonly [number, number, number], s: readonly [number, number]): [number, number] {
  const len = Math.hypot(s[0], 1, s[1]);
  const n = [-s[0] / len, 1 / len, -s[1] / len] as const;
  const r = refractedDirection([-sun[0], -sun[1], -sun[2]], n);
  return [r[0] / -r[1], r[2] / -r[1]];
}

describe("refractedSunTravel", () => {
  it("is zero under an overhead sun", () => {
    expect(refractedSunTravel([0, 1, 0])).toEqual([0, 0]);
  });

  it("runs away from the sun at tan(asin(sin θ / n)) per unit depth: 0.477 for a sun 35° from the zenith", () => {
    const [x, z] = refractedSunTravel(sunAt(55, 0));
    expect(x).toBeCloseTo(-Math.tan(Math.asin(Math.sin(35 * DEG) / WATER_IOR)), 6);
    expect(x).toBeCloseTo(-0.477, 3);
    expect(z).toBeCloseTo(0, 12);
  });
});

describe("refractionFocusMatrix (∂ travel / ∂ slope at a level sea)", () => {
  it("is (1 − 1/n) times the identity under an overhead sun", () => {
    const g = refractionFocusMatrix([0, 1, 0]);
    const c = 1 - 1 / WATER_IOR;
    expect(g[0][0]).toBeCloseTo(c, 9);
    expect(g[1][1]).toBeCloseTo(c, 9);
    expect(g[0][1]).toBeCloseTo(0, 9);
    expect(g[1][0]).toBeCloseTo(0, 9);
  });

  it("for a sun 35° from the zenith along +x is diag(c / cos²φ, c), c = 1 − cos θ / (n cos φ), sin φ = sin θ / n", () => {
    // Derived by hand from Snell in the plane of incidence (tilt about z) and
    // across it (tilt about x); see the module comment.
    const theta = 35 * DEG;
    const phi = Math.asin(Math.sin(theta) / WATER_IOR);
    const c = 1 - Math.cos(theta) / (WATER_IOR * Math.cos(phi));
    const g = refractionFocusMatrix(sunAt(55, 0));
    expect(g[0][0]).toBeCloseTo(c / Math.cos(phi) ** 2, 6);
    expect(g[1][1]).toBeCloseTo(c, 6);
    expect(g[0][0]).toBeCloseTo(0.392, 3);
    expect(g[1][1]).toBeCloseTo(0.319, 3);
    expect(g[0][1]).toBeCloseTo(0, 9);
    expect(g[1][0]).toBeCloseTo(0, 9);
  });

  it("matches the numerical derivative of vector Snell for a sun swung round to 130° azimuth", () => {
    const sun = sunAt(55, 130);
    const g = refractionFocusMatrix(sun);
    const h = 1e-5;
    for (const [j, ds] of [[0, [h, 0]], [1, [0, h]]] as const) {
      const plus = travelThroughFacet(sun, [ds[0], ds[1]]);
      const minus = travelThroughFacet(sun, [-ds[0], -ds[1]]);
      expect(g[0][j]).toBeCloseTo((plus[0] - minus[0]) / (2 * h), 5);
      expect(g[1][j]).toBeCloseTo((plus[1] - minus[1]) / (2 * h), 5);
    }
  });
});

describe("hessianFromSlopeDifferences", () => {
  it("recovers the Hessian of a quadratic surface from slope differences along two skew steps", () => {
    // h = ½ (a x² + 2 b x z + c z²) has slope (a x + b z, b x + c z) and Hessian [[a, b], [b, c]].
    const [a, b, c] = [0.8, -0.3, 0.5];
    const slope = (x: number, z: number): [number, number] => [a * x + b * z, b * x + c * z];
    const stepX: [number, number] = [0.02, 0.005];
    const stepZ: [number, number] = [-0.004, 0.015];
    const s0 = slope(1, 2);
    const sx = slope(1 + stepX[0], 2 + stepX[1]);
    const sz = slope(1 + stepZ[0], 2 + stepZ[1]);
    const h = hessianFromSlopeDifferences([sx[0] - s0[0], sx[1] - s0[1]], [sz[0] - s0[0], sz[1] - s0[1]], stepX, stepZ);
    expect(h[0][0]).toBeCloseTo(a, 9);
    expect(h[0][1]).toBeCloseTo(b, 9);
    expect(h[1][0]).toBeCloseTo(b, 9);
    expect(h[1][1]).toBeCloseTo(c, 9);
  });

  it("is zero when the steps are degenerate (a seabed seen edge-on), not infinite", () => {
    expect(hessianFromSlopeDifferences([1, 1], [1, 1], [0.01, 0], [0.02, 0])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });
});

describe("causticJacobianDeterminant", () => {
  const overhead = refractionFocusMatrix([0, 1, 0]);

  it("is 1 under a flat surface at any depth", () => {
    const flat = [
      [0, 0],
      [0, 0],
    ] as const;
    expect(causticJacobianDeterminant(0, overhead, flat)).toBe(1);
    expect(causticJacobianDeterminant(7, overhead, flat)).toBe(1);
  });

  it("follows the closed form 1 − d · c · a k² sin(kx) under a sinusoid h = a sin(kx) and an overhead sun", () => {
    const [amplitude, k, depth] = [0.3, (2 * Math.PI) / 4, 1.5];
    const c = 1 - 1 / WATER_IOR;
    for (const x of [0, 0.4, 1, 1.7, 2.3, 3.1]) {
      const hxx = -amplitude * k * k * Math.sin(k * x);
      const det = causticJacobianDeterminant(depth, overhead, [
        [hxx, 0],
        [0, 0],
      ]);
      expect(det).toBeCloseTo(1 - depth * c * amplitude * k * k * Math.sin(k * x), 12);
    }
  });

  it("focuses more under the slanted sun, in the plane of incidence", () => {
    const slanted = refractionFocusMatrix(sunAt(55, 0));
    const concave = [
      [-0.5, 0],
      [0, 0],
    ] as const;
    expect(causticJacobianDeterminant(2, slanted, concave)).toBeLessThan(causticJacobianDeterminant(2, overhead, concave));
  });
});

describe("causticIntensity (1 / |det J| with a soft knee)", () => {
  it("is exactly 1 under a flat surface", () => {
    expect(causticIntensity(1)).toBe(1);
  });

  it("is the inverse area ratio wherever the surface is not near a fold: 2 at det ½, ½ at det 2", () => {
    expect(causticIntensity(0.5)).toBeCloseTo(2, 12);
    expect(causticIntensity(2)).toBeCloseTo(0.5, 12);
    expect(causticIntensity(CAUSTIC_KNEE)).toBeCloseTo(1 / CAUSTIC_KNEE, 12);
  });

  it("stays finite through a fold (det 0) and treats a folded sheet (det < 0) as light too", () => {
    expect(causticIntensity(0)).toBe(2 / CAUSTIC_KNEE);
    expect(Number.isFinite(causticIntensity(0))).toBe(true);
    expect(causticIntensity(-0.5)).toBeCloseTo(causticIntensity(0.5), 12);
  });

  it("rises steadily and smoothly toward the fold, with no jump at the knee", () => {
    let prev = causticIntensity(3);
    for (let det = 3; det >= 0; det -= 0.001) {
      const i = causticIntensity(det);
      expect(i).toBeGreaterThanOrEqual(prev);
      // Continuous: no step larger than the local slope allows.
      expect(i - prev).toBeLessThan(0.05);
      prev = i;
    }
  });

  it("caps the lines at a few times the mean light", () => {
    expect(2 / CAUSTIC_KNEE).toBeGreaterThanOrEqual(3);
    expect(2 / CAUSTIC_KNEE).toBeLessThanOrEqual(6);
  });
});

describe("energy", () => {
  /**
   * A sinusoidal sea h = a sin(kx) over a flat seabed `depth` down, lit by
   * `sun`. The light through a surface patch lands where its exact refracted
   * ray (vector Snell, not the linearised focus matrix) reaches the seabed;
   * the seabed point's intensity is the module's 1 / |det J| at the surface
   * point that lights it. Over one wavelength the seabed receives what the
   * surface admitted, so the mean intensity over the seabed is 1.
   */
  function meanSeabedIntensity(sun: [number, number, number], amplitude: number, k: number, depth: number): number {
    const focus = refractionFocusMatrix(sun);
    const period = (2 * Math.PI) / k;
    const slopeAt = (x: number) => amplitude * k * Math.cos(k * x);
    const landing = (x: number) => x + depth * travelThroughFacet(sun, [slopeAt(x), 0])[0];
    const intensityAt = (x: number) =>
      causticIntensity(
        causticJacobianDeterminant(depth, focus, [
          [-amplitude * k * k * Math.sin(k * x), 0],
          [0, 0],
        ])
      );
    // Invert the (monotone) landing map by bisection for each seabed point.
    const samples = 2000;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const target = (i / samples) * period;
      let lo = target - 2 * period;
      let hi = target + 2 * period;
      for (let it = 0; it < 60; it++) {
        const mid = (lo + hi) / 2;
        if (landing(mid) < target) lo = mid;
        else hi = mid;
      }
      sum += intensityAt((lo + hi) / 2);
    }
    return sum / samples;
  }

  it("is conserved on average over a wave period: mean seabed intensity ≈ 1 before the surface folds", () => {
    // A 4 m wave of 10 cm amplitude 2 m down: d · c · a k² = 0.123, so det J
    // ranges 0.877 … 1.123, well clear of the knee, and the intensity is the
    // plain inverse area ratio.
    const k = (2 * Math.PI) / 4;
    expect(meanSeabedIntensity([0, 1, 0], 0.1, k, 2)).toBeCloseTo(1, 2);
    expect(meanSeabedIntensity(sunAt(55, 0), 0.1, k, 2)).toBeCloseTo(1, 2);
  });

  it("brightens under the concave crest (1 / 0.877) and darkens under the trough (1 / 1.123)", () => {
    const k = (2 * Math.PI) / 4;
    const focus = refractionFocusMatrix([0, 1, 0]);
    const at = (x: number) =>
      causticIntensity(causticJacobianDeterminant(2, focus, [[-0.1 * k * k * Math.sin(k * x), 0], [0, 0]]));
    expect(at(1)).toBeCloseTo(1 / 0.877, 2);
    expect(at(3)).toBeCloseTo(1 / 1.123, 2);
  });
});

describe("causticDepthFade (a band's focusing folds out past a depth of order its wavelength)", () => {
  const [, chop, ripple] = WAVE_CASCADES;
  /** The band's mean wavelength: 2π over the geometric mean of its wavenumber limits. */
  const meanWavelength = (c: { kMin: number; kMax: number }) => (2 * Math.PI) / Math.sqrt(c.kMin * c.kMax);

  it("keeps the ripple band (0.41–3.2 m) in full down to its mean wavelength, ~1.1 m, and loses it by three", () => {
    const lambda = meanWavelength(ripple);
    expect(lambda).toBeCloseTo(1.15, 1);
    expect(causticDepthFade(0, ripple.kMin, ripple.kMax)).toBe(1);
    expect(causticDepthFade(lambda, ripple.kMin, ripple.kMax)).toBe(1);
    expect(causticDepthFade(3 * lambda, ripple.kMin, ripple.kMax)).toBe(0);
    expect(causticDepthFade(40, ripple.kMin, ripple.kMax)).toBe(0);
    expect(CAUSTIC_DEPTH_FADE_WAVELENGTHS).toEqual([1, 3]);
  });

  it("keeps most of the chop band (3.2–23 m, mean ~8.6 m) across the shelf and loses it down the drop-off", () => {
    expect(meanWavelength(chop)).toBeCloseTo(8.6, 0);
    expect(causticDepthFade(5, chop.kMin, chop.kMax)).toBe(1);
    expect(causticDepthFade(15, chop.kMin, chop.kMax)).toBeGreaterThan(0.5);
    expect(causticDepthFade(30, chop.kMin, chop.kMax)).toBe(0);
  });

  it("never fades the swell band, whose wavelengths are unbounded", () => {
    expect(causticDepthFade(100, 0, chop.kMin)).toBe(1);
  });

  it("falls steadily with depth", () => {
    let prev = 1;
    for (let d = 0; d <= 12; d += 0.1) {
      const f = causticDepthFade(d, ripple.kMin, ripple.kMax);
      expect(f).toBeLessThanOrEqual(prev);
      prev = f;
    }
  });
});

describe("causticLodFade (a band's lines need texels to draw on)", () => {
  const [, , ripple] = WAVE_CASCADES;
  const lambda = (2 * Math.PI) / ripple.kMin;

  it("shows a band in full once its longest wave spans 8 texels of the smoothed look-up, and not at all under 4", () => {
    expect(CAUSTIC_LOD_TEXELS).toEqual([4, 8]);
    expect(causticLodFade(lambda / 8, ripple.kMin)).toBe(1);
    expect(causticLodFade(lambda / 16, ripple.kMin)).toBe(1);
    expect(causticLodFade(lambda / 4, ripple.kMin)).toBe(0);
    expect(causticLodFade(lambda, ripple.kMin)).toBe(0);
    const mid = causticLodFade(lambda / 6, ripple.kMin);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("hides the ripple band at map zoom (1.4–1.9 m per pixel, prepass texels twice that)", () => {
    expect(causticLodFade(2 * 1.4, ripple.kMin)).toBe(0);
  });

  it("never fades the swell band", () => {
    expect(causticLodFade(100, 0)).toBe(1);
  });
});

describe("the smoothed look-up (CAUSTIC_MIN_WAVE_TEXELS)", () => {
  it("drops waves shorter than a handful of prepass texels, which could only draw as grain", () => {
    expect(CAUSTIC_MIN_WAVE_TEXELS).toBeGreaterThanOrEqual(4);
    expect(CAUSTIC_MIN_WAVE_TEXELS).toBeLessThanOrEqual(12);
  });

  it("biases the mip look-up so a bilinear sample still resolves that wave, and differences over the same scale", () => {
    // A mip level L averages 2^L texels and passes waves of 2 · 2^L texels and up.
    expect(2 ** CAUSTIC_LOD_BIAS * 2).toBeCloseTo(CAUSTIC_MIN_WAVE_TEXELS, 9);
    expect(CAUSTIC_STEP_SCALE).toBeCloseTo(2 ** CAUSTIC_LOD_BIAS, 9);
  });
});

describe("CAUSTIC_FOCUS_GLSL", () => {
  it("mirrors the knee, the fades, the smoothing and the intensity", () => {
    expect(CAUSTIC_FOCUS_GLSL).toContain(`const float CAUSTIC_KNEE = ${CAUSTIC_KNEE.toFixed(4)};`);
    expect(CAUSTIC_FOCUS_GLSL).toContain(`const float CAUSTIC_LOD_BIAS = ${CAUSTIC_LOD_BIAS.toFixed(4)};`);
    expect(CAUSTIC_FOCUS_GLSL).toContain(`const float CAUSTIC_STEP_SCALE = ${CAUSTIC_STEP_SCALE.toFixed(4)};`);
    expect(CAUSTIC_FOCUS_GLSL).toContain("float causticIntensity(float det)");
    expect(CAUSTIC_FOCUS_GLSL).toContain("float causticDepthFade(float depthMetres, float kMin, float kMax)");
    expect(CAUSTIC_FOCUS_GLSL).toContain("float causticLodFade(float footprintMetres, float kMin)");
    expect(CAUSTIC_FOCUS_GLSL).toContain("float causticJacobianDeterminant(float depth, mat2 focus, mat2 hessian)");
    expect(CAUSTIC_FOCUS_GLSL).toContain("mat2 hessianFromSlopeDifferences(vec2 dSlopeX, vec2 dSlopeZ, vec2 stepX, vec2 stepZ)");
  });
});
