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
      wetSand: 0xb8925e,
      drySand: 0xe3cf9c,
      jungle: 0x367a43,
      highlandRock: 0x9d8d79,
      surf: 0xf2faf7,
      palmFrond: 0x4f8a34,
      palmTrunk: 0x8a6a45,
      seabedSand: 0xbfb49d,
      coral: 0x56442b,
      deepSeabed: 0xa3a27b,
    });
  });

  describe("seabed (#38): bottom reflectance at 600 / 550 / 450 nm (Maritorena et al. 1994, Fig. 6)", () => {
    const close = (name: "seabedSand" | "coral" | "deepSeabed", rgb: [number, number, number]) => {
      const c = paletteColor(name);
      expect(c.r).toBeCloseTo(rgb[0], 2);
      expect(c.g).toBeCloseTo(rgb[1], 2);
      expect(c.b).toBeCloseTo(rgb[2], 2);
    };
    it("makes seabed sand clean coral sand", () => close("seabedSand", [0.518, 0.456, 0.339]));
    it("makes coral the brown-algae spectrum, a dark stand-in for live coral", () =>
      close("coral", [0.094, 0.058, 0.024]));
    it("makes the deep seabed half coral sand, half green algae", () => close("deepSeabed", [0.367, 0.363, 0.197]));
  });

  it("keeps palm fronds brighter than the jungle floor so palms stand out", () => {
    const frond = paletteColor("palmFrond");
    const jungle = paletteColor("jungle");
    expect(frond.g).toBeGreaterThan(jungle.g);
  });

  it("gives the jungle canopy a tropical-forest albedo (0.12–0.18 linear) and keeps it green", () => {
    const { r, g, b } = paletteColor("jungle");
    const albedo = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(albedo).toBeGreaterThanOrEqual(0.12);
    expect(albedo).toBeLessThanOrEqual(0.18);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("gives highland rock a weathered-limestone albedo (0.25–0.30 linear) in a warm grey-tan", () => {
    const rock = paletteColor("highlandRock");
    const albedo = 0.2126 * rock.r + 0.7152 * rock.g + 0.0722 * rock.b;
    expect(albedo).toBeGreaterThanOrEqual(0.25);
    expect(albedo).toBeLessThanOrEqual(0.3);
    expect(rock.r).toBeGreaterThanOrEqual(rock.g);
    expect(rock.g).toBeGreaterThanOrEqual(rock.b);
    // Low saturation in sRGB (HSV), so it reads as grey-tan rather than orange.
    const { r, g, b } = rock.clone().convertLinearToSRGB();
    expect((Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b)).toBeLessThan(0.3);
  });

  it("keeps highland rock clearly darker than dry sand", () => {
    const albedo = ({ r, g, b }: Color) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(albedo(paletteColor("highlandRock"))).toBeLessThan(0.6 * albedo(paletteColor("drySand")));
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
    expect(glslConstName("seabedSand")).toBe("PALETTE_SEABED_SAND");
    expect(glslConstName("highlandRock")).toBe("PALETTE_HIGHLAND_ROCK");
    expect(glslConstName("surf")).toBe("PALETTE_SURF");
  });

  it("PALETTE_GLSL declares one linear vec3 constant per entry", () => {
    const lines = PALETTE_GLSL.split("\n");
    expect(lines).toHaveLength(PALETTE_NAMES.length);
    const jungle = paletteColor("jungle");
    expect(lines).toContain(`const vec3 PALETTE_JUNGLE = ${glslVec3(jungle)};`);
    // Linear, not sRGB: 0x36/255 = 0.2118 in sRGB is ~0.0368 linear.
    expect(jungle.r).toBeCloseTo(0.0368, 3);
  });

  it("has no hand-picked water colours: the water takes its colour from the seabed (#38)", () => {
    expect(PALETTE_NAMES).not.toContain("deepWater");
    expect(PALETTE_NAMES).not.toContain("reefTeal");
    expect(PALETTE_NAMES).not.toContain("shallows");
  });
});
