import { describe, expect, it } from "vitest";
import {
  HULL_FOAM_ANCHOR_STRENGTH,
  HULL_FOAM_FULL_SPEED,
  HULL_FOAM_GLSL,
  HULL_FOAM_REACH,
  HULL_FOAM_WAKE_LENGTHS,
  hullFoamCoverage,
} from "./hullFoam";

const heading: [number, number] = [0, 1]; // bow toward +z
const hull = 0.8; // a galleon, world units

describe("hullFoamCoverage", () => {
  it("is a light ring on a ship at anchor and full strength under way", () => {
    expect(hullFoamCoverage([0, 0], heading, hull, 0)).toBeCloseTo(HULL_FOAM_ANCHOR_STRENGTH, 12);
    expect(hullFoamCoverage([0, 0], heading, hull, HULL_FOAM_FULL_SPEED)).toBeCloseTo(1, 12);
    expect(hullFoamCoverage([0, 0], heading, hull, 10)).toBeCloseTo(1, 12);
    expect(HULL_FOAM_ANCHOR_STRENGTH).toBeGreaterThan(0);
    expect(HULL_FOAM_ANCHOR_STRENGTH).toBeLessThan(0.6);
  });

  it("is strongest at the hull and gone about half a hull length out", () => {
    const beside = (d: number) => hullFoamCoverage([d, 0], heading, hull, 0);
    expect(beside(0.1)).toBeGreaterThan(beside(0.2));
    expect(beside(0.2)).toBeGreaterThan(beside(0.3));
    expect(beside(HULL_FOAM_REACH * hull + 0.001)).toBe(0);
    expect(HULL_FOAM_REACH).toBeCloseTo(0.5, 12);
  });

  it("follows the hull along its heading: a point off the bow is as close as the same point abeam of the stern", () => {
    // The hull is a segment of half the hull length along the heading, so
    // the foam is an elongated patch, not a disc.
    const abeam = hullFoamCoverage([0.2, 0], heading, hull, 0);
    const aheadOfBow = hullFoamCoverage([0, hull / 2 + 0.2], heading, hull, 0);
    const alongside = hullFoamCoverage([0.2, hull / 2 - 0.1], heading, hull, 0);
    expect(aheadOfBow).toBeCloseTo(abeam, 9);
    expect(alongside).toBeCloseTo(abeam, 9);
  });

  it("is symmetric across the hull and, at rest, fore and aft", () => {
    expect(hullFoamCoverage([0.2, 0.1], heading, hull, 0)).toBeCloseTo(hullFoamCoverage([-0.2, 0.1], heading, hull, 0), 12);
    expect(hullFoamCoverage([0.1, 0.6], heading, hull, 0)).toBeCloseTo(hullFoamCoverage([0.1, -0.6], heading, hull, 0), 12);
  });

  it("trails a wake astern when under way, and none ahead", () => {
    const astern = hullFoamCoverage([0, -hull], heading, hull, HULL_FOAM_FULL_SPEED);
    const ahead = hullFoamCoverage([0, hull], heading, hull, HULL_FOAM_FULL_SPEED);
    expect(astern).toBeGreaterThan(0.5);
    expect(ahead).toBe(0);
    expect(hullFoamCoverage([0, -hull], heading, hull, 0)).toBe(0);
    expect(HULL_FOAM_WAKE_LENGTHS).toBeGreaterThanOrEqual(1);
  });

  it("turns with the heading", () => {
    const east: [number, number] = [1, 0];
    expect(hullFoamCoverage([-hull, 0], east, hull, HULL_FOAM_FULL_SPEED)).toBeGreaterThan(0.5);
    expect(hullFoamCoverage([0, -hull], east, hull, HULL_FOAM_FULL_SPEED)).toBe(0);
  });

  it("has no foam for a hull of no length", () => {
    expect(hullFoamCoverage([0.1, 0], heading, 0, 1)).toBe(0);
  });
});

describe("HULL_FOAM_GLSL", () => {
  it("mirrors the constants and the coverage", () => {
    expect(HULL_FOAM_GLSL).toContain(`const float HULL_FOAM_REACH = ${HULL_FOAM_REACH.toFixed(4)};`);
    expect(HULL_FOAM_GLSL).toContain(`const float HULL_FOAM_ANCHOR_STRENGTH = ${HULL_FOAM_ANCHOR_STRENGTH.toFixed(4)};`);
    expect(HULL_FOAM_GLSL).toContain(`const float HULL_FOAM_FULL_SPEED = ${HULL_FOAM_FULL_SPEED.toFixed(4)};`);
    expect(HULL_FOAM_GLSL).toContain(`const float HULL_FOAM_WAKE_LENGTHS = ${HULL_FOAM_WAKE_LENGTHS.toFixed(4)};`);
    expect(HULL_FOAM_GLSL).toContain("float hullFoamCoverage(vec2 offset, vec2 heading, float hullLength, float speed)");
  });
});
