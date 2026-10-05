import { describe, it, expect } from "vitest";
import {
  CAUSTIC_CELL_METRES,
  CAUSTIC_FREQUENCY,
  CAUSTIC_WEB_MEAN,
  causticContrast,
  causticLod,
  causticLight,
  CAUSTIC_PATTERN_GLSL,
} from "./causticPattern";

/** One hex, centre to centre, in world units. */
const HEX_UNITS = Math.sqrt(3);

describe("causticPattern (#38)", () => {
  describe("scale", () => {
    it("uses real shallow-water cell sizes, 0.3–3 m", () => {
      expect(CAUSTIC_CELL_METRES).toBeGreaterThanOrEqual(0.3);
      expect(CAUSTIC_CELL_METRES).toBeLessThanOrEqual(3);
    });

    it("fits dozens of cells across a hex, not a handful", () => {
      const cellsPerHex = HEX_UNITS * CAUSTIC_FREQUENCY;
      expect(cellsPerHex).toBeGreaterThan(35);
      expect(cellsPerHex).toBeLessThan(400);
    });
  });

  describe("contrast by depth", () => {
    it("is nothing at the waterline", () => {
      expect(causticContrast(0)).toBe(0);
    });

    it("puts line peaks 20–30% over the mean in 1–3 m of water", () => {
      for (let d = 1; d <= 3; d += 0.25) {
        expect(causticContrast(d)).toBeGreaterThanOrEqual(0.2);
        expect(causticContrast(d)).toBeLessThanOrEqual(0.3);
      }
    });

    it("falls off with depth and is gone by 12 m", () => {
      let prev = causticContrast(3);
      for (let d = 3.5; d <= 12; d += 0.5) {
        const c = causticContrast(d);
        expect(c).toBeLessThanOrEqual(prev);
        prev = c;
      }
      expect(causticContrast(12)).toBe(0);
      expect(causticContrast(40)).toBe(0);
    });
  });

  describe("level of detail by screen footprint", () => {
    it("hides cells of 3 px or less (their lines are sub-pixel) and shows cells of 6 px or more in full", () => {
      expect(causticLod(0.5)).toBe(0);
      expect(causticLod(3)).toBe(0);
      expect(causticLod(6)).toBe(1);
      expect(causticLod(50)).toBe(1);
      const mid = causticLod(4.5);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
    });
  });

  describe("light on the seabed", () => {
    it("redistributes light: the pattern's mean leaves the light unchanged", () => {
      expect(causticLight(CAUSTIC_WEB_MEAN, 0.25)).toBeCloseTo(1, 12);
    });

    it("puts line peaks at 1 + contrast and the cells between slightly darker", () => {
      expect(causticLight(1, 0.25)).toBeCloseTo(1.25, 12);
      const cell = causticLight(0, 0.25);
      expect(cell).toBeLessThan(1);
      expect(cell).toBeGreaterThan(0.9);
    });

    it("is uniform light with no contrast", () => {
      expect(causticLight(0, 0)).toBe(1);
      expect(causticLight(1, 0)).toBe(1);
    });
  });

  it("declares the same pattern in GLSL", () => {
    expect(CAUSTIC_PATTERN_GLSL).toContain(`const float CAUSTIC_FREQUENCY = ${CAUSTIC_FREQUENCY.toFixed(4)};`);
    expect(CAUSTIC_PATTERN_GLSL).toContain(`const float CAUSTIC_WEB_MEAN = ${CAUSTIC_WEB_MEAN.toFixed(4)};`);
    expect(CAUSTIC_PATTERN_GLSL).toContain("float causticContrast(float depthMetres)");
    expect(CAUSTIC_PATTERN_GLSL).toContain("float causticLod(float cellPixels)");
    expect(CAUSTIC_PATTERN_GLSL).toContain("float causticLight(float web, float contrast)");
  });
});
