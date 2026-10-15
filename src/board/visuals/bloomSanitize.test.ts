import { describe, expect, it } from "vitest";
import { BLOOM_INPUT_MAX, BLOOM_SANITIZE_GLSL, sanitizeBloomAlpha, sanitizeBloomInput } from "./bloomSanitize";

describe("bloomSanitize: what reaches the bloom is finite and in range", () => {
  it("leaves an ordinary HDR colour as it is", () => {
    expect(sanitizeBloomInput([0.2, 1.5, 24])).toEqual([0.2, 1.5, 24]);
  });

  it("turns a pixel with a NaN to black, so the blur cannot spread it over the frame", () => {
    expect(sanitizeBloomInput([NaN, 0.4, 0.4])).toEqual([0, 0, 0]);
  });

  it("holds Infinity and over-range channels to the cap, and negative ones to 0", () => {
    // A negative pixel is what MSAA's extrapolated varyings left on a silhouette in the scan (−1.07, −0.25, −0.09)
    expect(sanitizeBloomInput([-1.07, -0.25, -0.09])).toEqual([0, 0, 0]);
    expect(sanitizeBloomInput([Infinity, 1e6, -Infinity])).toEqual([BLOOM_INPUT_MAX, BLOOM_INPUT_MAX, 0]);
  });

  it("holds alpha to [0, 1] too, since the mipmap blur spreads all four channels; a NaN alpha reads as opaque", () => {
    expect(sanitizeBloomAlpha(0.25)).toBe(0.25);
    expect(sanitizeBloomAlpha(-2)).toBe(0);
    expect(sanitizeBloomAlpha(3)).toBe(1);
    expect(sanitizeBloomAlpha(Infinity)).toBe(1);
    expect(sanitizeBloomAlpha(-Infinity)).toBe(0);
    expect(sanitizeBloomAlpha(NaN)).toBe(1);
  });

  it("caps well under a half float's largest value, and far over the brightest real pixel (about 40)", () => {
    expect(BLOOM_INPUT_MAX * 4).toBeLessThan(65504);
    expect(BLOOM_INPUT_MAX).toBeGreaterThan(400);
  });

  it("is a postprocessing effect that tests NaN and Infinity from the bits, which fast-math cannot fold away", () => {
    expect(BLOOM_SANITIZE_GLSL).toMatch(/void mainImage\(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor\)/);
    expect(BLOOM_SANITIZE_GLSL).toMatch(/floatBitsToUint/);
    expect(BLOOM_SANITIZE_GLSL).toMatch(/finiteColour\(inputColor\.rgb, BLOOM_INPUT_MAX\)/);
    expect(BLOOM_SANITIZE_GLSL).toMatch(/finiteChannel\(inputColor\.a, 1\.0, alphaIsNan\)/);
    expect(BLOOM_SANITIZE_GLSL).not.toMatch(/\bis(nan|inf)\s*\(/);
  });
});
