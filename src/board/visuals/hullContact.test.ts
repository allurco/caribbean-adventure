import { describe, expect, it } from "vitest";
import {
  BOW_WAVE_OFFSET_BEAMS,
  HULL_CONTACT_DARKEN,
  HULL_CONTACT_DARK_BAND_BEAMS,
  HULL_CONTACT_GLSL,
  HULL_CONTACT_LINE_BEAMS,
  HULL_CONTACT_STRENGTH,
  SHIP_FOAM_SHALLOW_METRES,
  bowWaveCoverage,
  hullContactCoverage,
  hullContactShade,
  hullWaterlineDistance,
  lineDetailFade,
  shipFoamDepthFade,
} from "./hullContact";

// A Frigate-sized waterline in world units, bow toward +z.
const halfLength = 0.39;
const halfBeam = 0.11;
const beam = 2 * halfBeam;
const sharp = 1e-6; // a footprint far under the line: ship zoom

describe("hullWaterlineDistance", () => {
  it("is zero on the waterline, negative inside and positive outside", () => {
    expect(hullWaterlineDistance(0, halfBeam, halfLength, halfBeam, 1)).toBeCloseTo(0, 12);
    expect(hullWaterlineDistance(halfLength, 0, halfLength, halfBeam, 1)).toBeCloseTo(0, 12);
    expect(hullWaterlineDistance(0, 0, halfLength, halfBeam, 1)).toBeCloseTo(-halfBeam, 12);
    expect(hullWaterlineDistance(0, halfBeam + 0.05, halfLength, halfBeam, 1)).toBeCloseTo(0.05, 12);
  });

  it("rounds the ends of a modelled hull into a stadium and keeps a box hull's corners square", () => {
    // 45° off the bow's centre of curvature, one beam out: a stadium is round there.
    const centre = halfLength - halfBeam;
    const r = halfBeam + 0.02;
    const diag = hullWaterlineDistance(centre + r * Math.SQRT1_2, r * Math.SQRT1_2, halfLength, halfBeam, 1);
    expect(diag).toBeCloseTo(0.02, 9);
    // A square box: its corner is on the outline.
    expect(hullWaterlineDistance(halfLength, halfBeam, halfLength, halfBeam, 0)).toBeCloseTo(0, 12);
  });

  it("is symmetric across the hull", () => {
    expect(hullWaterlineDistance(0.3, 0.1, halfLength, halfBeam, 1)).toBeCloseTo(hullWaterlineDistance(0.3, -0.1, halfLength, halfBeam, 1), 12);
  });
});

describe("hullContactCoverage", () => {
  it("is a crisp line hugging the hull at rest: full at the waterline, gone a line width out", () => {
    const at = (d: number) => hullContactCoverage(d, 0, beam, 0, sharp);
    expect(at(0)).toBeCloseTo(HULL_CONTACT_STRENGTH, 12);
    expect(at(-0.05)).toBeCloseTo(HULL_CONTACT_STRENGTH, 12); // under the hull: hidden, but never a gap
    expect(at(HULL_CONTACT_LINE_BEAMS * beam * 0.5)).toBeGreaterThan(0.2);
    expect(at(HULL_CONTACT_LINE_BEAMS * beam + 1e-6)).toBe(0);
    expect(HULL_CONTACT_LINE_BEAMS).toBeLessThan(0.25); // a line, not a patch
  });

  it("is wider under way, along the sides and most at the bow", () => {
    const d = HULL_CONTACT_LINE_BEAMS * beam * 1.2;
    const restSide = hullContactCoverage(d, 0, beam, 0, sharp);
    const movingSide = hullContactCoverage(d, 0, beam, 1, sharp);
    const movingBow = hullContactCoverage(d, 1, beam, 1, sharp);
    const movingStern = hullContactCoverage(d, -1, beam, 1, sharp);
    expect(restSide).toBe(0);
    expect(movingSide).toBeGreaterThan(0);
    expect(movingBow).toBeGreaterThan(movingSide);
    expect(movingStern).toBeLessThanOrEqual(movingSide);
  });

  it("fades out where the line is under a pixel or two (map zoom)", () => {
    const width = HULL_CONTACT_LINE_BEAMS * beam;
    expect(hullContactCoverage(0, 0, beam, 0, width / 10)).toBeCloseTo(HULL_CONTACT_STRENGTH, 12);
    expect(hullContactCoverage(0, 0, beam, 0, width * 2)).toBe(0);
  });
});

describe("lineDetailFade", () => {
  it("keeps a line three pixels wide and drops one a pixel wide", () => {
    expect(lineDetailFade(3, 1)).toBe(1);
    expect(lineDetailFade(1, 1)).toBe(0);
    expect(lineDetailFade(2, 1)).toBeGreaterThan(0);
    expect(lineDetailFade(2, 1)).toBeLessThan(1);
  });
});

describe("bowWaveCoverage", () => {
  it("is nothing at rest", () => {
    expect(bowWaveCoverage(BOW_WAVE_OFFSET_BEAMS * beam, 1, beam, 0, sharp)).toBe(0);
  });

  it("stands a crest off the stem under way, and none along the stern", () => {
    const crest = BOW_WAVE_OFFSET_BEAMS * beam;
    expect(bowWaveCoverage(crest, 1.2, beam, 1, sharp)).toBeGreaterThan(0.5);
    expect(bowWaveCoverage(crest, 1.2, beam, 1, sharp)).toBeGreaterThan(bowWaveCoverage(crest * 3, 1.2, beam, 1, sharp));
    expect(bowWaveCoverage(crest, -0.8, beam, 1, sharp)).toBe(0);
  });
});

describe("hullContactShade", () => {
  it("darkens a band against the hull and nothing past it", () => {
    expect(hullContactShade(0, beam)).toBeCloseTo(HULL_CONTACT_DARKEN, 12);
    expect(hullContactShade(HULL_CONTACT_DARK_BAND_BEAMS * beam * 0.5, beam)).toBeGreaterThan(0);
    expect(hullContactShade(HULL_CONTACT_DARK_BAND_BEAMS * beam + 1e-6, beam)).toBe(0);
    expect(HULL_CONTACT_DARKEN).toBeLessThan(0.5); // darker water, not a black outline
  });
});

describe("shipFoamDepthFade", () => {
  it("is nothing on land and at the waterline, full in water deeper than the shore wash", () => {
    expect(shipFoamDepthFade(-1)).toBe(0);
    expect(shipFoamDepthFade(0)).toBe(0);
    expect(shipFoamDepthFade(SHIP_FOAM_SHALLOW_METRES / 2)).toBeGreaterThan(0);
    expect(shipFoamDepthFade(SHIP_FOAM_SHALLOW_METRES)).toBe(1);
    expect(shipFoamDepthFade(50)).toBe(1);
  });
});

describe("HULL_CONTACT_GLSL", () => {
  it("mirrors the constants and functions", () => {
    expect(HULL_CONTACT_GLSL).toContain(`const float HULL_CONTACT_LINE_BEAMS = ${HULL_CONTACT_LINE_BEAMS.toFixed(4)};`);
    expect(HULL_CONTACT_GLSL).toContain(`const float HULL_CONTACT_DARKEN = ${HULL_CONTACT_DARKEN.toFixed(4)};`);
    expect(HULL_CONTACT_GLSL).toContain(`const float SHIP_FOAM_SHALLOW_METRES = ${SHIP_FOAM_SHALLOW_METRES.toFixed(4)};`);
    for (const signature of [
      "float hullWaterlineDistance(float along, float across, float halfLength, float halfBeam, float roundness)",
      "float lineDetailFade(float width, float footprint)",
      "float hullContactCoverage(float distance, float alongShare, float beam, float motion, float footprint)",
      "float bowWaveCoverage(float distance, float alongShare, float beam, float motion, float footprint)",
      "float hullContactShade(float distance, float beam)",
      "float shipFoamDepthFade(float depthMetres)",
    ]) {
      expect(HULL_CONTACT_GLSL).toContain(signature);
    }
  });
});
