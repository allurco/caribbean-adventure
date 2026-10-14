import { describe, expect, it } from "vitest";
import { hex, hexToWorld, type Hex } from "../game/hex";
import type { MapCell } from "../game/types";
import { HULL_CLEARANCE, openWaterFrom, seaRoute } from "./shipRoute";
import type { Point } from "./shipMotion";

const cell = (q: number, r: number, terrain: MapCell["terrain"] = "water"): MapCell => ({
  hex: hex(q, r),
  terrain,
  hasPort: false,
  elevation: terrain === "water" ? 0 : 2,
});
const xz = (h: Hex): Point => {
  const [x, , z] = hexToWorld(h);
  return [x, z];
};

describe("seaRoute", () => {
  // A small patch of sea round an island at (1, 0).
  const cells: MapCell[] = [];
  for (let q = -1; q <= 3; q++) for (let r = -2; r <= 2; r++) cells.push(cell(q, r, q === 1 && r === 0 ? "island" : "water"));

  it("goes straight to a neighbouring hex", () => {
    expect(seaRoute(xz(hex(0, 0)), xz(hex(1, -1)), cells, null)).toEqual([xz(hex(1, -1))]);
  });

  it("runs through the hexes of a multi-hex move, round the land, ending on the destination", () => {
    const route = seaRoute(xz(hex(0, 0)), xz(hex(2, 0)), cells, null);
    expect(route.length).toBeGreaterThan(1);
    expect(route[route.length - 1]).toEqual(xz(hex(2, 0)));
    expect(route).not.toContainEqual(xz(hex(1, 0)));
  });

  it("falls back to a straight move when there is no route", () => {
    const landlocked = [cell(0, 0), cell(1, 0, "island"), cell(2, 0)];
    expect(seaRoute(xz(hex(0, 0)), xz(hex(2, 0)), landlocked, null)).toEqual([xz(hex(2, 0))]);
  });
});

describe("openWaterFrom", () => {
  // A shore along x = 1: seabed to the west, land to the east.
  const height = (x: number) => (x < 1 ? -0.1 : 0.2);
  const water = openWaterFrom((x) => height(x));

  it("is open water well off the shore", () => {
    expect(water(0, 0)).toBe(true);
  });

  it("is not open water on land, nor within a hull's clearance of the shore", () => {
    expect(water(2, 0)).toBe(false);
    expect(water(1 - HULL_CLEARANCE / 2, 0)).toBe(false);
  });
});
