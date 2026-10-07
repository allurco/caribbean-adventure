import { describe, it, expect } from "vitest";
import { HEX_METRES, PROP_DENSITY, PROP_SCALE, WATER_FOLLOWS_HEX_SCALE, propDensityFor, propScaleFor } from "./propScale";
import { METRES_PER_UNIT, metresPerUnitFor } from "./worldScale";
import { parseDevUrlParams } from "../devUrlParams";

describe("the #84 prop scale", () => {
  it("is exactly 1 with no hexMetres, so every prop and the water are today's", () => {
    expect(propScaleFor(undefined)).toBe(1);
    expect(propScaleFor(parseDevUrlParams("").hexMetres)).toBe(1);
    expect(propDensityFor(1)).toBe(1);
    // The page under test has no URL parameters.
    expect(PROP_SCALE).toBe(1);
    expect(PROP_DENSITY).toBe(1);
    expect(HEX_METRES).toBe(115);
    expect(WATER_FOLLOWS_HEX_SCALE).toBe(false);
    expect(METRES_PER_UNIT).toBe(65);
    expect(metresPerUnitFor(115)).toBe(65);
  });

  it("shrinks props by 115 / hexMetres and places them by the inverse square, capped", () => {
    expect(propScaleFor(1000)).toBeCloseTo(0.115);
    expect(propDensityFor(propScaleFor(350))).toBe(9);
    expect(propDensityFor(propScaleFor(600))).toBe(27);
    expect(propDensityFor(propScaleFor(1000))).toBe(76);
    expect(propDensityFor(0.01)).toBe(80);
  });

  it("moves the water's unit with the hex scale when asked", () => {
    expect(metresPerUnitFor(1000)).toBeCloseTo(565.2, 1);
  });

  it("reads the experiment's URL parameters", () => {
    expect(parseDevUrlParams("?hexMetres=350&scaleWater=1&minDist=1")).toEqual({ hexMetres: 350, scaleWater: true, minDistance: 1 });
    expect(parseDevUrlParams("?hexMetres=0&scaleWater=yes&minDist=-1")).toEqual({});
  });
});
