import { describe, it, expect } from "vitest";
import { SHIP_SCALE, metresToUnits } from "./visuals/worldScale";
import { DEFAULT_HULL_BOX, SHIP_RIDE_HEIGHT, SHIP_SINK_DEPTH, shipHullBox } from "./shipHull";

const expectBox = (actual: readonly number[], expected: readonly number[]) => {
  expect(actual).toHaveLength(3);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));
};

describe("shipHullBox", () => {
  const toWorld = (metres: number) => metresToUnits(metres) * SHIP_SCALE;

  it("sizes the Frigate's box from its model: 10.2 m beam, 8.4 m deep, 38 m long, at ship scale", () => {
    expectBox(shipHullBox("Frigate"), [toWorld(10.2), toWorld(8.4), toWorld(38)]);
  });

  it("sizes the Galleon's box from its model: 13.6 m beam, 11.1 m deep, 42 m long, at ship scale", () => {
    expectBox(shipHullBox("Galleon"), [toWorld(13.6), toWorld(11.1), toWorld(42)]);
  });

  it("sizes the Sloop's box from its model: 5.6 m beam, 4.15 m deep, 18 m long, at ship scale", () => {
    expectBox(shipHullBox("Sloop"), [toWorld(5.6), toWorld(4.15), toWorld(18)]);
  });

  it("sizes the Flute's box from its model: 7.4 m beam, 7.2 m deep, 30 m long, at ship scale", () => {
    expectBox(shipHullBox("Flute"), [toWorld(7.4), toWorld(7.2), toWorld(30)]);
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
