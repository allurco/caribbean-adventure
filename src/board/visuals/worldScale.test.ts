import { describe, expect, it } from "vitest";
import { METRES_PER_UNIT, metresToUnits, unitsToMetres } from "./worldScale";

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
