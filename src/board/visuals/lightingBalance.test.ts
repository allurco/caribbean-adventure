import { describe, expect, it } from "vitest";
import { GOLDEN_HOUR, lightingFor } from "./lighting";
import { hexLuminance, lightOnFacet } from "./lightingBalance";
import type { Vec3 } from "./sunDirection";

const golden = lightingFor(GOLDEN_HOUR);
const noon = lightingFor(12);
const UP: Vec3 = [0, 1, 0];
const dot = (a: Vec3, b: Vec3) => (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a);

/** The sand facet by Velasquez Port that read as a hard grey parallelogram in the #203 check. */
const PAST_TERMINATOR: Vec3 = [-0.03, 0.85, 0.52];
/** A slope facing the camera (it looks due north, 47° down). */
const CAMERA_FACING_SLOPE: Vec3 = [0, 0.6, 0.8];

describe("hexLuminance", () => {
  it("is 1 for white, 0 for black, and weights green most", () => {
    expect(hexLuminance("#ffffff")).toBeCloseTo(1, 6);
    expect(hexLuminance("#000000")).toBe(0);
    expect(hexLuminance("#00ff00")).toBeGreaterThan(hexLuminance("#ff0000"));
  });
});

describe("faces turned from the golden-hour sun (#169)", () => {
  const flatSunlit = lightOnFacet(golden, UP);

  it("the #203 facet lies just past the sun's terminator", () => {
    const nDotL = dot(PAST_TERMINATOR, golden.sun.direction);
    expect(nDotL).toBeLessThan(0);
    expect(nDotL).toBeGreaterThan(-0.15);
  });

  it("keeps a facet just past the terminator at 45–60 % of level sunlit ground, not a hard grey drop", () => {
    const ratio = lightOnFacet(golden, PAST_TERMINATOR) / flatSunlit;
    expect(ratio).toBeGreaterThanOrEqual(0.45);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });

  it("keeps the camera-facing slopes at least 40 % of level sunlit ground", () => {
    expect(lightOnFacet(golden, CAMERA_FACING_SLOPE) / flatSunlit).toBeGreaterThanOrEqual(0.4);
  });

  it("keeps the shade within reach of midday's balance, where the sun still reached that facet", () => {
    // Midday's sun still reaches it, so its share there is the reference for a readable face.
    const middayShare = lightOnFacet(noon, PAST_TERMINATOR) / lightOnFacet(noon, UP);
    expect(lightOnFacet(golden, PAST_TERMINATOR) / flatSunlit).toBeGreaterThan(middayShare * 0.55);
  });

  it("has no hard step at the terminator: the sun carries at most 55 % of the light on level ground", () => {
    const sunOnly = hexLuminance(golden.sun.color) * golden.sun.intensity * golden.sun.direction[1];
    expect(sunOnly / flatSunlit).toBeLessThanOrEqual(0.55);
  });

  it("lights the shade warm: the ambient's sky and ground and the fill are all warmer than neutral", () => {
    const warm = (hex: string) => parseInt(hex.slice(1, 3), 16) > parseInt(hex.slice(5, 7), 16);
    expect(warm(golden.ambient.skyColor)).toBe(true);
    expect(warm(golden.ambient.groundColor)).toBe(true);
    expect(warm(golden.fill.color)).toBe(true);
  });

  it("raises the sky's diffuse share under the low sun", () => {
    expect(golden.sky.diffuseFraction).toBeGreaterThan(noon.sky.diffuseFraction);
  });

  it("leaves the midday look as it was: no ambient", () => {
    expect(noon.ambient.intensity).toBe(0);
  });
});
