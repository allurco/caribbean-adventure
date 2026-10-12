import { describe, it, expect } from "vitest";
import { SHIP_SCALE, metresToUnits } from "./visuals/worldScale";
import { DEFAULT_HULL_BOX, SHIP_RIDE_HEIGHT, SHIP_SINK_DEPTH, shipHullBox } from "./shipHull";

const expectBox = (actual: readonly number[], expected: readonly number[]) => {
  expect(actual).toHaveLength(3);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));
};

describe("shipHullBox", () => {
  it("sizes the Frigate's box from its model: 10.2 m beam, 8.4 m deep, 38 m long, at ship scale", () => {
    const toWorld = (metres: number) => metresToUnits(metres) * SHIP_SCALE;
    expectBox(shipHullBox("Frigate"), [toWorld(10.2), toWorld(8.4), toWorld(38)]);
  });

  it("keeps the authored boxes for the classes without a model", () => {
    expectBox(shipHullBox("Sloop"), [0.25 * SHIP_SCALE, 0.2 * SHIP_SCALE, 0.65 * SHIP_SCALE]);
    expectBox(shipHullBox("Flute"), [0.4 * SHIP_SCALE, 0.3 * SHIP_SCALE, 0.6 * SHIP_SCALE]);
    expectBox(shipHullBox("Galleon"), [0.5 * SHIP_SCALE, 0.35 * SHIP_SCALE, 0.8 * SHIP_SCALE]);
  });

  it("keeps the default box for a ship without a class", () => {
    expectBox(shipHullBox(undefined), [0.3 * SHIP_SCALE, 0.25 * SHIP_SCALE, 0.7 * SHIP_SCALE]);
    expect(shipHullBox(undefined)).toBe(DEFAULT_HULL_BOX);
  });

  it("keeps the ride height and sink depth", () => {
    expect(SHIP_RIDE_HEIGHT).toBeCloseTo(0.12 * SHIP_SCALE, 10);
    expect(SHIP_SINK_DEPTH).toBeCloseTo(1.5 * SHIP_SCALE, 10);
  });
});
