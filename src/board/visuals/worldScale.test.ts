import { describe, expect, it } from "vitest";
import {
  AUTHORED_HEX_METRES,
  BUILDING_ENLARGEMENT,
  BUILDING_SCALE,
  HEX_METRES,
  METRES_PER_UNIT,
  PROP_DENSITY,
  PROP_DENSITY_CAP,
  PROP_SCALE,
  SHIP_SCALE,
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

describe("the props' scale (ADR 0003)", () => {
  it("draws a hex as 350 m, against the 115 m the props were authored at", () => {
    expect(AUTHORED_HEX_METRES).toBe(115);
    expect(HEX_METRES).toBe(350);
  });

  it("draws props at 115 / 350 of their authored size", () => {
    expect(PROP_SCALE).toBe(115 / 350);
    expect(PROP_SCALE).toBeCloseTo(0.329, 3);
  });

  it("draws ships at twice true scale", () => {
    expect(SHIP_SCALE).toBe(2 * (115 / 350));
    expect(SHIP_SCALE).toBeCloseTo(0.657, 3);
  });

  it("draws buildings 1.125 times true scale", () => {
    expect(BUILDING_ENLARGEMENT).toBe(1.125);
    expect(BUILDING_SCALE).toBe((115 / 350) * 1.125);
    expect(BUILDING_SCALE).toBeCloseTo(0.37, 3);
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
