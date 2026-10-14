import { describe, expect, it } from "vitest";
import { buoyGrid } from "./buoyGrid";

describe("buoyGrid", () => {
  it("lays a square of buoys centred on the grid point nearest the focus", () => {
    expect(buoyGrid({ x: 0.9, z: -1.2 }, 3, 1)).toEqual([
      [0, -2], [1, -2], [2, -2],
      [0, -1], [1, -1], [2, -1],
      [0, 0], [1, 0], [2, 0],
    ]);
  });

  it("holds the buoys still in the world while the focus moves less than a spacing", () => {
    expect(buoyGrid({ x: 4.1, z: 0 }, 1, 2)).toEqual([[4, 0]]);
    expect(buoyGrid({ x: 4.9, z: 0.6 }, 1, 2)).toEqual([[4, 0]]);
  });
});
