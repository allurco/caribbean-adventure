import { describe, expect, it } from "vitest";
import {
  combineFoam,
  FOAM_ALBEDO,
  FOAM_CHURN_GAP_DEPTH,
  FOAM_SUN_WHITENING,
  FOAM_LACE_SOFTNESS,
  FOAM_SHADING_GLSL,
  foamChurnLace,
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

describe("foamChurnLace", () => {
  it("is nothing without coverage and solid at full coverage past the softness", () => {
    expect(foamChurnLace(0, 0.9, 0.9)).toBe(0);
    expect(foamChurnLace(1, 0.5, 0.5)).toBe(1);
  });

  it("thins dense churn where the coarse noise is low into holes, without cutting it apart", () => {
    // Dense churn: where the coarse noise is lowest the lace is thinner, but bright fine noise still passes there.
    expect(foamChurnLace(0.6, 0, 0.45)).toBeLessThan(foamChurnLace(0.6, 1, 0.45));
    expect(foamChurnLace(0.9, 0, 0.8)).toBeGreaterThan(0.5);
    expect(FOAM_CHURN_GAP_DEPTH).toBeGreaterThan(0.2);
    expect(FOAM_CHURN_GAP_DEPTH).toBeLessThan(0.6);
  });

  it("is laced by the fine noise: holes inside the body", () => {
    expect(foamChurnLace(0.6, 0.7, 0.2)).toBeLessThan(foamChurnLace(0.6, 0.7, 0.9));
  });

  it("is nearly solid when fresh and falls apart only as it thins", () => {
    expect(foamChurnLace(0.85, 0.9, 0.3)).toBeGreaterThan(0.9);
    expect(foamChurnLace(0.3, 0.9, 0.3)).toBeLessThan(foamChurnLace(0.85, 0.9, 0.3));
    expect(foamChurnLace(0.2, 0.5, 0.5)).toBe(0);
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
  it("is a bright white with a slight cool tint: luminance 0.85 … 0.9, blue ≥ green ≥ red, barely", () => {
    const [r, g, b] = FOAM_ALBEDO;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance).toBeGreaterThanOrEqual(0.85);
    expect(luminance).toBeLessThanOrEqual(0.9);
    expect(b).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(r);
    expect(b - r).toBeLessThan(0.1);
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

  it("keeps the foam white under a golden sun: less tinted than the sun, no brighter", () => {
    const golden: [number, number, number] = [1.2, 0.9, 0.55];
    const [r, , b] = foamRadiance(1, golden, [0, 0, 0]);
    // The red-to-blue ratio of the foam is well under the sun's own (times the albedo's).
    expect(r / b).toBeLessThan(((golden[0] / golden[2]) * FOAM_ALBEDO[0]) / FOAM_ALBEDO[2]);
    const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const plain = golden.map((e, i) => (FOAM_ALBEDO[i] * e) / Math.PI);
    expect(lum(foamRadiance(1, golden, [0, 0, 0]))).toBeCloseTo(lum(plain), 1);
    expect(FOAM_SUN_WHITENING).toBeGreaterThan(0);
    expect(FOAM_SUN_WHITENING).toBeLessThan(1);
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
    expect(FOAM_SHADING_GLSL).toContain(`const float FOAM_CHURN_GAP_DEPTH = ${FOAM_CHURN_GAP_DEPTH.toFixed(4)};`);
    expect(FOAM_SHADING_GLSL).toContain(`const float FOAM_SUN_WHITENING = ${FOAM_SUN_WHITENING.toFixed(4)};`);
    expect(FOAM_SHADING_GLSL).toContain("float foamChurnLace(float coverage, float coarse, float fine)");
    expect(FOAM_SHADING_GLSL).toContain("float foamDetailFade(float footprintMetres, float featureMetres)");
    expect(FOAM_SHADING_GLSL).toContain("vec3 foamRadiance(vec3 n, vec3 l, vec3 sunIrradiance, vec3 skyDiffuse)");
    expect(FOAM_SHADING_GLSL).toContain("return FOAM_ALBEDO * (whitened * max(dot(n, l), 0.0) / PI + skyDiffuse);");
  });
});
