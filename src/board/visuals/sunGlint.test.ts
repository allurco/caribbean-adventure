import { describe, expect, it } from "vitest";
import { ggxDistribution, smithMasking, sunGlintRadiance } from "./sunGlint";
import type { Vec3 } from "./sunDirection";

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const UP: Vec3 = [0, 1, 0];

describe("ggxDistribution", () => {
  it("is normalised: ∫ D(h) (n·h) dω = 1 over the hemisphere", () => {
    for (const alpha2 of [0.003, 0.03, 0.3]) {
      const steps = 200000;
      let sum = 0;
      for (let i = 0; i < steps; i++) {
        // Integrate in u = cos θ: dω = 2π du for an isotropic D.
        const u = (i + 0.5) / steps;
        sum += ggxDistribution(u, alpha2) * u * 2 * Math.PI * (1 / steps);
      }
      expect(sum).toBeCloseTo(1, 2);
    }
  });

  it("peaks at 1 / (π α²) along the normal", () => {
    expect(ggxDistribution(1, 0.01)).toBeCloseTo(1 / (Math.PI * 0.01), 6);
  });
});

describe("smithMasking", () => {
  it("does not mask at normal incidence", () => {
    expect(smithMasking(1, 0.05)).toBeCloseTo(1, 6);
  });

  it("masks more toward grazing angles and on rougher seas", () => {
    expect(smithMasking(0.2, 0.05)).toBeLessThan(smithMasking(0.8, 0.05));
    expect(smithMasking(0.2, 0.2)).toBeLessThan(smithMasking(0.2, 0.05));
  });
});

describe("sunGlintRadiance", () => {
  const sun = normalize([0, 1, 1]); // 45° up, toward +z
  const mirror = normalize([0, 1, -1]); // the view direction (toward the eye) that sees the mirror image

  it("is brightest in the mirror direction", () => {
    const off = normalize([0.3, 1, -1]);
    expect(sunGlintRadiance(UP, mirror, sun, 0.01, 1)).toBeGreaterThan(
      5 * sunGlintRadiance(UP, off, sun, 0.01, 1)
    );
  });

  it("is E · D · G · F / (4 n·v) at the mirror point: a worked value", () => {
    // n·h = 1, n·v = n·l = cos 45°, F = 0.02 + 0.98 (1 − cos 45°)⁵ ≈ 0.0221,
    // D = 1 / (π · 0.01) ≈ 31.83, G ≈ 0.990 → radiance ≈ 31.83 · 0.990 · 0.0221 / 2.828 ≈ 0.246.
    expect(sunGlintRadiance(UP, mirror, sun, 0.01, 1)).toBeCloseTo(0.246, 2);
  });

  it("is zero with the sun below the facet", () => {
    expect(sunGlintRadiance(UP, mirror, normalize([0, -1, 1]), 0.01, 1)).toBe(0);
  });

  it("scales with the sun's irradiance and is not clamped", () => {
    const one = sunGlintRadiance(UP, mirror, sun, 0.001, 1);
    expect(sunGlintRadiance(UP, mirror, sun, 0.001, 10)).toBeCloseTo(10 * one, 6);
    expect(one).toBeGreaterThan(1);
  });
});
