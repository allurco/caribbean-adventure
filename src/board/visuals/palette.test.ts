import { describe, it, expect } from "vitest";
import { Color } from "three";
import {
  PALETTE_HEX,
  PALETTE_NAMES,
  PALETTE_GLSL,
  paletteColor,
  glslVec3,
  glslConstName,
} from "./palette";

describe("palette", () => {
  it("defines the issue #8 starting values and the issue #14 palm colours", () => {
    expect(PALETTE_HEX).toEqual({
      deepWater: 0x0e3a5b,
      reefTeal: 0x1c8c8c,
      shallows: 0x5fd4c9,
      wetSand: 0xb8925e,
      drySand: 0xe3cf9c,
      jungle: 0x2f6b3a,
      highlandRock: 0x76695a,
      surf: 0xf2faf7,
      palmFrond: 0x4f8a34,
      palmTrunk: 0x8a6a45,
    });
  });

  it("keeps palm fronds brighter than the jungle floor so palms stand out", () => {
    const frond = paletteColor("palmFrond");
    const jungle = paletteColor("jungle");
    expect(frond.g).toBeGreaterThan(jungle.g);
  });

  it("paletteColor round-trips to the sRGB hex", () => {
    for (const name of PALETTE_NAMES) {
      expect(paletteColor(name).getHex()).toBe(PALETTE_HEX[name]);
    }
  });

  it("paletteColor returns a fresh instance each call", () => {
    const a = paletteColor("surf");
    a.setRGB(1, 0, 0);
    expect(paletteColor("surf").getHex()).toBe(PALETTE_HEX.surf);
  });

  it("glslVec3 formats linear components as float literals", () => {
    expect(glslVec3(new Color(1, 0, 0.5))).toBe("vec3(1.0000, 0.0000, 0.5000)");
  });

  it("glslConstName converts camelCase to PALETTE_UPPER_SNAKE", () => {
    expect(glslConstName("deepWater")).toBe("PALETTE_DEEP_WATER");
    expect(glslConstName("highlandRock")).toBe("PALETTE_HIGHLAND_ROCK");
    expect(glslConstName("surf")).toBe("PALETTE_SURF");
  });

  it("PALETTE_GLSL declares one linear vec3 constant per entry", () => {
    const lines = PALETTE_GLSL.split("\n");
    expect(lines).toHaveLength(PALETTE_NAMES.length);
    const deep = paletteColor("deepWater");
    expect(lines).toContain(`const vec3 PALETTE_DEEP_WATER = ${glslVec3(deep)};`);
    // Linear, not sRGB: 0x0E/255 = 0.0549 in sRGB is ~0.0044 linear.
    expect(deep.r).toBeCloseTo(0.0044, 3);
  });
});
