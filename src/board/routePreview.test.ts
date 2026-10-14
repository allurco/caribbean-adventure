import { describe, it, expect } from "vitest";
import { routeDots, routePoints, ROUTE_DOT_CLEARANCE, ROUTE_DOT_SPACING } from "./routePreview";
import { createWrap, hex, hexToWorld, offsetToHex, wrapWorldWidth } from "../game/hex";

describe("routeDots", () => {
  it("is nothing for no route", () => {
    expect(routeDots(hex(0, 0), [], Infinity)).toEqual([]);
  });

  it("runs from clear of the ship to the last hex's centre, evenly spaced", () => {
    const route = [hex(1, 0), hex(2, 0), hex(3, 0)];
    const dots = routeDots(hex(0, 0), route, Infinity);
    const [ex, , ez] = hexToWorld(hex(3, 0));
    const last = dots[dots.length - 1];
    expect(last[0]).toBeCloseTo(ex, 5);
    expect(last[1]).toBeCloseTo(ez, 5);
    const [sx, , sz] = hexToWorld(hex(0, 0));
    expect(Math.hypot(dots[0][0] - sx, dots[0][1] - sz)).toBeGreaterThan(ROUTE_DOT_CLEARANCE);
    for (let i = 1; i < dots.length; i++) {
      const gap = Math.hypot(dots[i][0] - dots[i - 1][0], dots[i][1] - dots[i - 1][1]);
      expect(gap).toBeGreaterThan(ROUTE_DOT_SPACING * 0.6);
      expect(gap).toBeLessThan(ROUTE_DOT_SPACING * 1.4);
    }
  });

  it("has at least one dot for a neighbour", () => {
    expect(routeDots(hex(0, 0), [hex(1, 0)], Infinity).length).toBeGreaterThanOrEqual(1);
  });
});

describe("routePoints", () => {
  it("runs on over the seam from the ship's side", () => {
    const wrap = createWrap(8);
    const width = wrapWorldWidth(wrap);
    const start = offsetToHex(7, 2);
    const points = routePoints(start, [offsetToHex(0, 2), offsetToHex(1, 2)], width);
    const step = hexToWorld(offsetToHex(1, 2))[0] - hexToWorld(offsetToHex(0, 2))[0];
    expect(points[1][0] - points[0][0]).toBeCloseTo(step, 5);
    expect(points[2][0] - points[1][0]).toBeCloseTo(step, 5);
  });
});
