import { describe, expect, it } from "vitest";
import { METRES_PER_UNIT, PROP_SCALE } from "./worldScale";
import {
  HULL_FOAM_ANCHOR_STRENGTH,
  HULL_FOAM_FULL_SPEED,
  HULL_FOAM_GLSL,
  HULL_FOAM_NOISE_METRES,
  HULL_FOAM_NOISE_SCALE,
  HULL_FOAM_REACH,
  HULL_FOAM_UNDERWAY_STRENGTH,
  hullFoamCoverage,
} from "./hullFoam";

const heading: [number, number] = [0, 1]; // bow toward +z
const hull = 0.8; // a galleon, world units

describe("hullFoamCoverage", () => {
  it("is a few faint threads on a ship at anchor and a stirred patch under way, never solid", () => {
    expect(hullFoamCoverage([0, 0], heading, hull, 0)).toBeCloseTo(HULL_FOAM_ANCHOR_STRENGTH, 12);
    expect(hullFoamCoverage([0, 0], heading, hull, HULL_FOAM_FULL_SPEED)).toBeCloseTo(HULL_FOAM_UNDERWAY_STRENGTH, 12);
    expect(hullFoamCoverage([0, 0], heading, hull, 10)).toBeCloseTo(HULL_FOAM_UNDERWAY_STRENGTH, 12);
    expect(HULL_FOAM_ANCHOR_STRENGTH).toBeGreaterThan(0);
    expect(HULL_FOAM_ANCHOR_STRENGTH).toBeLessThan(0.2); // threads, not a halo
    expect(HULL_FOAM_UNDERWAY_STRENGTH).toBeGreaterThan(HULL_FOAM_ANCHOR_STRENGTH);
    expect(HULL_FOAM_UNDERWAY_STRENGTH).toBeLessThan(0.7); // lace, not a white patch
  });

  it("is strongest at the hull and gone a short way out", () => {
    const beside = (d: number) => hullFoamCoverage([d, 0], heading, hull, 0);
    const reach = HULL_FOAM_REACH * hull;
    expect(beside(0.2 * reach)).toBeGreaterThan(beside(0.5 * reach));
    expect(beside(0.5 * reach)).toBeGreaterThan(beside(0.8 * reach));
    expect(beside(reach + 0.001)).toBe(0);
    expect(HULL_FOAM_REACH).toBeLessThan(0.2); // narrow: the contact line carries the contact
  });

  it("follows the hull along its heading: a point off the bow is as close as the same point abeam of the stern", () => {
    // The hull is a segment of the hull length along the heading, so the
    // foam is an elongated patch, not a disc.
    const d = 0.05;
    const abeam = hullFoamCoverage([d, 0], heading, hull, 0);
    const aheadOfBow = hullFoamCoverage([0, hull / 2 + d], heading, hull, 0);
    const alongside = hullFoamCoverage([d, hull / 2 - 0.1], heading, hull, 0);
    expect(aheadOfBow).toBeCloseTo(abeam, 9);
    expect(alongside).toBeCloseTo(abeam, 9);
    // Elongated: past the stem it is gone where abeam of amidships it is not.
    expect(hullFoamCoverage([0, hull / 2 + HULL_FOAM_REACH * hull + 0.001], heading, hull, 0)).toBe(0);
    expect(hullFoamCoverage([0.05, hull / 2 - 0.01], heading, hull, 0)).toBeGreaterThan(0);
  });

  it("is symmetric across the hull and fore and aft", () => {
    expect(hullFoamCoverage([0.02, 0.1], heading, hull, 0)).toBeCloseTo(hullFoamCoverage([-0.02, 0.1], heading, hull, 0), 12);
    expect(hullFoamCoverage([0.02, 0.45], heading, hull, 0)).toBeCloseTo(hullFoamCoverage([0.02, -0.45], heading, hull, 0), 12);
  });

  it("trails no wake of its own under way: the wake trail lays it, and none under reduced motion", () => {
    const astern = hullFoamCoverage([0, -hull], heading, hull, HULL_FOAM_FULL_SPEED);
    const ahead = hullFoamCoverage([0, hull], heading, hull, HULL_FOAM_FULL_SPEED);
    expect(astern).toBe(0);
    expect(ahead).toBe(0);
    expect(hullFoamCoverage([0.02, -0.42], heading, hull, HULL_FOAM_FULL_SPEED)).toBeCloseTo(
      hullFoamCoverage([0.02, 0.42], heading, hull, HULL_FOAM_FULL_SPEED),
      12,
    );
  });

  it("turns with the heading", () => {
    const east: [number, number] = [1, 0];
    expect(hullFoamCoverage([hull / 2, 0.02], east, hull, 0)).toBeGreaterThan(0);
    expect(hullFoamCoverage([0.02, hull / 2], east, hull, 0)).toBe(0);
  });

  it("has no foam for a hull of no length", () => {
    expect(hullFoamCoverage([0.1, 0], heading, 0, 1)).toBe(0);
  });
});

describe("HULL_FOAM_GLSL", () => {
  it("mirrors the constants and the coverage", () => {
    expect(HULL_FOAM_GLSL).toContain(`const float HULL_FOAM_REACH = ${HULL_FOAM_REACH.toFixed(4)};`);
    expect(HULL_FOAM_GLSL).toContain(`const float HULL_FOAM_ANCHOR_STRENGTH = ${HULL_FOAM_ANCHOR_STRENGTH.toFixed(4)};`);
    expect(HULL_FOAM_GLSL).toContain(`const float HULL_FOAM_UNDERWAY_STRENGTH = ${HULL_FOAM_UNDERWAY_STRENGTH.toFixed(4)};`);
    expect(HULL_FOAM_GLSL).toContain(`const float HULL_FOAM_FULL_SPEED = ${HULL_FOAM_FULL_SPEED.toFixed(4)};`);
    expect(HULL_FOAM_GLSL).toContain("float hullFoamCoverage(vec2 offset, vec2 heading, float hullLength, float speed)");
  });
});

describe("hull foam lace size (ADR 0006)", () => {
  it("is set in water metres, so it keeps its size between ship scale ×1 and ×2.3", () => {
    // One noise cycle in metres, as the water measures them; ship scale is not an input.
    expect(HULL_FOAM_NOISE_SCALE).toBeCloseTo(METRES_PER_UNIT / HULL_FOAM_NOISE_METRES, 12);
    // Its size before ADR 0006, when it followed the ship scale of 2 × PROP_SCALE.
    expect(HULL_FOAM_NOISE_METRES).toBeCloseTo((METRES_PER_UNIT * 2 * PROP_SCALE) / 14, 12);
  });
});
