import { describe, expect, it } from "vitest";
import {
  AUTHORED_HEX_METRES,
  BUILDING_ENLARGEMENT,
  BUILDING_SCALE,
  BUILDING_TRUE_SCALE,
  HEX_METRES,
  LANDMARK_ENLARGEMENT,
  LANDMARK_SCALE,
  METRES_PER_UNIT,
  PROP_DENSITY,
  PROP_DENSITY_CAP,
  PROP_SCALE,
  SHIP_ENLARGEMENT,
  SHIP_SCALE,
  TOWN_PIECE_SCALE,
  VEGETATION_SCALE,
  metresToUnits,
  propDensityFor,
  unitsToMetres,
} from "./worldScale";

describe("world scale", () => {
  it("is 65 metres per world unit", () => {
    expect(METRES_PER_UNIT).toBe(65);
  });

  it("makes a galleon model (0.8 units long) about 50 m", () => {
    expect(unitsToMetres(0.8)).toBeCloseTo(52, 5);
  });

  it("makes a hex (sqrt 3 units flat to flat) about 115 m across", () => {
    expect(unitsToMetres(Math.sqrt(3))).toBeGreaterThan(110);
    expect(unitsToMetres(Math.sqrt(3))).toBeLessThan(115);
  });

  it("converts metres to units and back", () => {
    expect(metresToUnits(65)).toBe(1);
    expect(unitsToMetres(metresToUnits(12.5))).toBeCloseTo(12.5, 10);
  });
});

describe("the props' scale (ADR 0003, ADR 0006)", () => {
  it("draws a hex as 350 m, against the 115 m the props were authored at", () => {
    expect(AUTHORED_HEX_METRES).toBe(115);
    expect(HEX_METRES).toBe(350);
  });

  it("draws props at 115 / 350 of their authored size", () => {
    expect(PROP_SCALE).toBe(115 / 350);
    expect(PROP_SCALE).toBeCloseTo(0.329, 3);
  });

  it("draws ships 2.3 times their old twice-true size (ADR 0006)", () => {
    expect(SHIP_ENLARGEMENT).toBe(2.3);
    expect(SHIP_SCALE).toBe(2.3 * 2 * (115 / 350));
    expect(SHIP_SCALE).toBeCloseTo(1.511, 3);
  });

  it("starts vegetation at today's factor, until its own slice of #158 (ADR 0006)", () => {
    expect(VEGETATION_SCALE).toBe(PROP_SCALE);
  });

  it("draws buildings 2.5 times ADR 0003's 1.125 × true scale (#176, ADR 0006)", () => {
    expect(BUILDING_TRUE_SCALE).toBe(1.125);
    expect(BUILDING_ENLARGEMENT).toBe(2.5);
    expect(BUILDING_SCALE).toBe((115 / 350) * 1.125 * 2.5);
    expect(BUILDING_SCALE).toBeCloseTo(0.924, 3);
  });

  it("draws the landmarks 1.6 times ADR 0003's buildings, smaller than the houses' 2.5 (#176)", () => {
    expect(LANDMARK_ENLARGEMENT).toBe(1.6);
    expect(LANDMARK_SCALE).toBe((115 / 350) * 1.125 * 1.6);
    expect(LANDMARK_SCALE).toBeCloseTo(0.591, 3);
    expect(LANDMARK_SCALE).toBeLessThan(BUILDING_SCALE);
  });

  it("draws the town's pieces (piers, quays, clutter) at the buildings' scale (#176)", () => {
    expect(TOWN_PIECE_SCALE).toBe(BUILDING_SCALE);
  });

  it("places derived props by the inverse square of the prop scale, rounded and capped", () => {
    expect(PROP_DENSITY).toBe(9);
    expect(propDensityFor(PROP_SCALE)).toBe(PROP_DENSITY);
    expect(propDensityFor(1)).toBe(1);
    expect(propDensityFor(2)).toBe(1);
    expect(propDensityFor(115 / 600)).toBe(27);
    expect(propDensityFor(0.01)).toBe(PROP_DENSITY_CAP);
  });
});
