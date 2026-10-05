import { describe, expect, it } from "vitest";
import {
  combineFoam,
  FOAM_ALBEDO,
  FOAM_LACE_SOFTNESS,
  FOAM_SHADING_GLSL,
  foamDetailFade,
  foamLace,
  foamRadiance,
} from "./foamShading";
import { cascadeLodFade } from "./waveNormalFilter";

describe("combineFoam", () => {
  it("is 0 with no foam and passes a single coverage through", () => {
    expect(combineFoam([])).toBe(0);
    expect(combineFoam([0, 0, 0])).toBe(0);
    expect(combineFoam([0.3])).toBeCloseTo(0.3, 12);
    expect(combineFoam([0.3, 0, 0])).toBeCloseTo(0.3, 12);
  });

  it("unions coverages: they saturate toward 1 rather than add past it", () => {
    expect(combineFoam([0.5, 0.5])).toBeCloseTo(0.75, 12);
    expect(combineFoam([0.7, 0.7, 0.7])).toBeLessThan(1);
    expect(combineFoam([1, 0.7])).toBe(1);
  });

  it("does not depend on the order", () => {
    expect(combineFoam([0.2, 0.6, 0.4])).toBeCloseTo(combineFoam([0.6, 0.4, 0.2]), 12);
  });
});

describe("foamLace", () => {
  it("draws nothing where there is no coverage, whatever the noise", () => {
    for (let n = 0; n <= 1; n += 0.05) expect(foamLace(0, n)).toBe(0);
  });

  it("draws everything at full coverage once the noise is past the softness", () => {
    expect(foamLace(1, FOAM_LACE_SOFTNESS)).toBe(1);
    expect(foamLace(1, 0.5)).toBe(1);
  });

  it("lets more noise through as the coverage grows, and brighter noise through at a coverage", () => {
    expect(foamLace(0.3, 0.75)).toBeGreaterThan(foamLace(0.2, 0.75));
    expect(foamLace(0.3, 0.8)).toBeGreaterThan(foamLace(0.3, 0.75));
    expect(foamLace(0.3, 0.5)).toBe(0);
  });
});

describe("foamDetailFade", () => {
  it("fades the lace out as its features fall under a few pixels, like a cascade's band", () => {
    expect(foamDetailFade(0.1, 2.5)).toBe(1);
    expect(foamDetailFade(2, 2.5)).toBe(0);
    expect(foamDetailFade(0.8, 2.5)).toBeCloseTo(cascadeLodFade(0.8, (2 * Math.PI) / 2.5), 12);
  });
});

describe("FOAM_ALBEDO", () => {
  it("is a bright, slightly warm white: luminance 0.85 … 0.9, red ≥ green ≥ blue", () => {
    const [r, g, b] = FOAM_ALBEDO;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance).toBeGreaterThanOrEqual(0.85);
    expect(luminance).toBeLessThanOrEqual(0.9);
    expect(r).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(b);
    expect(r - b).toBeLessThan(0.1);
  });
});

describe("foamRadiance", () => {
  it("is a Lambertian lit by the sun and the sky, in the water shader's irradiance units", () => {
    // Sun overhead, no sky: albedo · E / π. No sun: albedo · sky.
    const sun = foamRadiance(1, [1, 1, 1], [0, 0, 0]);
    sun.forEach((v, i) => expect(v).toBeCloseTo(FOAM_ALBEDO[i] / Math.PI, 12));
    const sky = foamRadiance(0, [1, 1, 1], [0.2, 0.3, 0.4]);
    expect(sky[2]).toBeCloseTo(FOAM_ALBEDO[2] * 0.4, 12);
  });

  it("never lights the foam from below the horizon", () => {
    expect(foamRadiance(-0.5, [1, 1, 1], [0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("FOAM_SHADING_GLSL", () => {
  it("mirrors the albedo, union, lace, detail fade and radiance", () => {
    expect(FOAM_SHADING_GLSL).toContain(`const vec3 FOAM_ALBEDO = vec3(${FOAM_ALBEDO.map((v) => v.toFixed(4)).join(", ")});`);
    expect(FOAM_SHADING_GLSL).toContain("float combineFoam(float a, float b, float c)");
    expect(FOAM_SHADING_GLSL).toContain("return 1.0 - (1.0 - a) * (1.0 - b) * (1.0 - c);");
    expect(FOAM_SHADING_GLSL).toContain("float foamLace(float coverage, float noise)");
    expect(FOAM_SHADING_GLSL).toContain("float foamDetailFade(float footprintMetres, float featureMetres)");
    expect(FOAM_SHADING_GLSL).toContain("vec3 foamRadiance(vec3 n, vec3 l, vec3 sunIrradiance, vec3 skyDiffuse)");
    expect(FOAM_SHADING_GLSL).toContain("return FOAM_ALBEDO * (sunIrradiance * max(dot(n, l), 0.0) / PI + skyDiffuse);");
  });
});
