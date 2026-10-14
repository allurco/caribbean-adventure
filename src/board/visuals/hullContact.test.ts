import { describe, expect, it } from "vitest";
import {
  BOW_WAVE_OFFSET_BEAMS,
  HULL_CONTACT_DARKEN,
  HULL_CONTACT_DARK_BAND_BEAMS,
  HULL_CONTACT_EDGE_BEAMS,
  HULL_CONTACT_GLSL,
  HULL_CONTACT_LINE_BEAMS,
  HULL_CONTACT_STRENGTH,
  HULL_STERN_ROUNDNESS,
  HULL_TRANSOM_BOW,
  LINE_MIN_PIXELS,
  SHIP_FOAM_SHALLOW_METRES,
  bowWaveCoverage,
  hullContactCoverage,
  hullContactShade,
  hullWaterlineDistance,
  lineDetailFade,
  lineDrawnWidth,
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

  it("points the ends of a fine hull into an ogive when the end radius is over a half beam", () => {
    // End radius 3 half beams: arcs tangent to the sides meet on the centre line at the stem.
    const pointed = (along: number, across: number) => hullWaterlineDistance(along, across, halfLength, halfBeam, 3);
    expect(pointed(halfLength, 0)).toBeCloseTo(0, 12); // the stem is on the outline
    expect(pointed(0, halfBeam)).toBeCloseTo(0, 12); // amidships it is as wide as the stadium
    expect(pointed(halfLength + 0.03, 0)).toBeCloseTo(0.03, 12); // ahead of the stem: the distance to the point
    // Near the stem the ogive is narrower than the stadium: a point on the stadium's outline is outside it.
    const nearStem = halfLength - 0.3 * halfBeam;
    const stadiumHalfWidth = Math.sqrt(halfBeam ** 2 - (nearStem - (halfLength - halfBeam)) ** 2);
    expect(hullWaterlineDistance(nearStem, stadiumHalfWidth, halfLength, halfBeam, 1)).toBeCloseTo(0, 9);
    expect(pointed(nearStem, stadiumHalfWidth)).toBeGreaterThan(0.2 * halfBeam);
    // The arc's distance is exact: one end radius from its centre.
    const radius = 3 * halfBeam;
    const end = halfBeam * Math.sqrt(2 * 3 - 1);
    const centre = [halfLength - end, halfBeam - radius];
    const angle = 0.3;
    const out = 0.02;
    expect(pointed(centre[0] + (radius + out) * Math.sin(angle), centre[1] + (radius + out) * Math.cos(angle))).toBeCloseTo(out, 9);
  });

  it("ends a fine-bowed hull aft in a transom, a rounded square, and a full-bowed one in its own round", () => {
    expect(hullWaterlineDistance(-0.3, 0.9 * halfBeam, halfLength, halfBeam, 1.2)).toBeCloseTo(hullWaterlineDistance(0.3, 0.9 * halfBeam, halfLength, halfBeam, 1.2), 12);
    expect(hullWaterlineDistance(-halfLength + 0.1 * halfBeam, 0.8 * halfBeam, halfLength, halfBeam, 1.2)).toBeGreaterThan(0);
    expect(HULL_STERN_ROUNDNESS).toBeLessThan(1);
    for (const roundness of [HULL_TRANSOM_BOW, 3]) {
      // The stern's corner reaches out where a stadium's or an ogive's would not.
      const corner = hullWaterlineDistance(-halfLength + 0.3 * halfBeam, 0.9 * halfBeam, halfLength, halfBeam, roundness);
      expect(corner).toBeLessThan(0);
      expect(hullWaterlineDistance(-halfLength, 0, halfLength, halfBeam, roundness)).toBeCloseTo(0, 12);
    }
    // A box hull keeps its own, squarer, corners.
    expect(hullWaterlineDistance(-halfLength, halfBeam, halfLength, halfBeam, 0)).toBeCloseTo(0, 12);
    // Bow and stern meet amidships without a step.
    expect(hullWaterlineDistance(-1e-9, halfBeam + 0.02, halfLength, halfBeam, 3)).toBeCloseTo(
      hullWaterlineDistance(1e-9, halfBeam + 0.02, halfLength, halfBeam, 3),
      9,
    );
  });

  it("is continuous across the stadium as the end radius passes a half beam", () => {
    for (const [along, across] of [
      [halfLength + 0.01, 0.02],
      [halfLength - 0.05, halfBeam],
      [0.1, halfBeam + 0.04],
    ]) {
      expect(hullWaterlineDistance(along, across, halfLength, halfBeam, 1.0001)).toBeCloseTo(
        hullWaterlineDistance(along, across, halfLength, halfBeam, 1),
        3,
      );
    }
  });

  it("keeps a very fine ogive's point at the stem when its ends would be longer than the hull", () => {
    expect(hullWaterlineDistance(halfLength, 0, halfLength, halfBeam, 100)).toBeCloseTo(0, 9);
    expect(hullWaterlineDistance(0, halfBeam, halfLength, halfBeam, 100)).toBeLessThanOrEqual(1e-9);
  });

  it("is symmetric across the hull", () => {
    for (const roundness of [0, 1, 3]) {
      expect(hullWaterlineDistance(0.3, 0.1, halfLength, halfBeam, roundness)).toBeCloseTo(
        hullWaterlineDistance(0.3, -0.1, halfLength, halfBeam, roundness),
        12,
      );
    }
  });
});

describe("hullContactCoverage", () => {
  const lineOuter = (HULL_CONTACT_LINE_BEAMS + HULL_CONTACT_EDGE_BEAMS) * beam;

  it("is a thin, crisp line just outside the waterline at rest: solid over its width, gone a short edge past it", () => {
    const at = (d: number) => hullContactCoverage(d, 0, beam, 0, sharp);
    expect(at(0)).toBeCloseTo(HULL_CONTACT_STRENGTH, 12);
    expect(at(-0.05)).toBeCloseTo(HULL_CONTACT_STRENGTH, 12); // under the hull: hidden, but never a gap
    expect(at(HULL_CONTACT_LINE_BEAMS * beam)).toBeCloseTo(HULL_CONTACT_STRENGTH, 12); // solid out to its width
    expect(at((HULL_CONTACT_LINE_BEAMS + 0.5 * HULL_CONTACT_EDGE_BEAMS) * beam)).toBeGreaterThan(0.3);
    expect(at(lineOuter + 1e-6)).toBe(0);
    // Crisp: the edge is narrower than the solid part, and the whole line is thin.
    expect(HULL_CONTACT_EDGE_BEAMS).toBeLessThan(HULL_CONTACT_LINE_BEAMS);
    expect(HULL_CONTACT_LINE_BEAMS + HULL_CONTACT_EDGE_BEAMS).toBeLessThan(0.12);
    expect(HULL_CONTACT_STRENGTH).toBeGreaterThanOrEqual(0.95); // nearly solid: the lace barely breaks it
  });

  it("is wider under way, along the sides and most at the bow", () => {
    const d = lineOuter * 1.05;
    const restSide = hullContactCoverage(d, 0, beam, 0, sharp);
    const movingSide = hullContactCoverage(d, 0, beam, 1, sharp);
    const movingBow = hullContactCoverage(d, 1, beam, 1, sharp);
    const movingStern = hullContactCoverage(d, -1, beam, 1, sharp);
    expect(restSide).toBe(0);
    expect(movingSide).toBeGreaterThan(0);
    expect(movingBow).toBeGreaterThan(movingSide);
    expect(movingStern).toBeLessThanOrEqual(movingSide);
  });

  it("keeps a minimum width on screen at mid zoom and fades out only at map zoom", () => {
    // Mid zoom: the line is about a pixel wide; it is drawn LINE_MIN_PIXELS wide, at full strength.
    const mid = lineOuter;
    expect(hullContactCoverage(0, 0, beam, 0, mid)).toBeCloseTo(HULL_CONTACT_STRENGTH, 12);
    expect(hullContactCoverage(lineOuter * 1.2, 0, beam, 0, mid)).toBeGreaterThan(0);
    // Map zoom: a few lines to a pixel, gone.
    expect(hullContactCoverage(0, 0, beam, 0, lineOuter * 8)).toBe(0);
  });
});

describe("lineDrawnWidth", () => {
  it("is the line's own width when it is wide on screen, and LINE_MIN_PIXELS when it would be thinner", () => {
    expect(lineDrawnWidth(0.1, 0.001)).toBeCloseTo(0.1, 12);
    expect(lineDrawnWidth(0.001, 0.01)).toBeCloseTo(LINE_MIN_PIXELS * 0.01, 12);
    expect(LINE_MIN_PIXELS).toBeGreaterThanOrEqual(1.5);
  });
});

describe("lineDetailFade", () => {
  it("keeps a line most of a pixel wide (mid zoom) and drops one a fifth of a pixel wide (map zoom)", () => {
    expect(lineDetailFade(0.8, 1)).toBe(1);
    expect(lineDetailFade(0.2, 1)).toBe(0);
    expect(lineDetailFade(0.45, 1)).toBeGreaterThan(0);
    expect(lineDetailFade(0.45, 1)).toBeLessThan(1);
    expect(lineDetailFade(1, 0)).toBe(1);
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

  it("grows with speed", () => {
    const crest = BOW_WAVE_OFFSET_BEAMS * beam;
    expect(bowWaveCoverage(crest, 1, beam, 0.3, sharp)).toBeLessThan(bowWaveCoverage(crest, 1, beam, 1, sharp));
  });
});

describe("hullContactShade", () => {
  it("darkens a band against the hull, darkest just past the foam line, and nothing past the band", () => {
    expect(hullContactShade(0, beam)).toBeCloseTo(HULL_CONTACT_DARKEN, 12);
    // Full darkness just past the foam line, so the band reads beside it.
    expect(hullContactShade((HULL_CONTACT_LINE_BEAMS + HULL_CONTACT_EDGE_BEAMS) * beam, beam)).toBeGreaterThan(0.9 * HULL_CONTACT_DARKEN);
    expect(hullContactShade(HULL_CONTACT_DARK_BAND_BEAMS * beam * 0.5, beam)).toBeGreaterThan(0);
    expect(hullContactShade(HULL_CONTACT_DARK_BAND_BEAMS * beam + 1e-6, beam)).toBe(0);
    expect(HULL_CONTACT_DARKEN).toBeLessThan(0.5); // darker water, not a black outline
    expect(HULL_CONTACT_DARK_BAND_BEAMS).toBeGreaterThan(2 * (HULL_CONTACT_LINE_BEAMS + HULL_CONTACT_EDGE_BEAMS)); // wider than the line
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
    expect(HULL_CONTACT_GLSL).toContain(`const float HULL_CONTACT_EDGE_BEAMS = ${HULL_CONTACT_EDGE_BEAMS.toFixed(4)};`);
    expect(HULL_CONTACT_GLSL).toContain(`const float LINE_MIN_PIXELS = ${LINE_MIN_PIXELS.toFixed(4)};`);
    expect(HULL_CONTACT_GLSL).toContain(`const float HULL_CONTACT_DARKEN = ${HULL_CONTACT_DARKEN.toFixed(4)};`);
    expect(HULL_CONTACT_GLSL).toContain(`const float SHIP_FOAM_SHALLOW_METRES = ${SHIP_FOAM_SHALLOW_METRES.toFixed(4)};`);
    for (const signature of [
      "float hullWaterlineDistance(float along, float across, float halfLength, float halfBeam, float roundness)",
      "float lineDetailFade(float width, float footprint)",
      "float lineDrawnWidth(float width, float footprint)",
      "float hullContactCoverage(float distance, float alongShare, float beam, float motion, float footprint)",
      "float bowWaveCoverage(float distance, float alongShare, float beam, float motion, float footprint)",
      "float hullContactShade(float distance, float beam)",
      "float shipFoamDepthFade(float depthMetres)",
    ]) {
      expect(HULL_CONTACT_GLSL).toContain(signature);
    }
  });
});
