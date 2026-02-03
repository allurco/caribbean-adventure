import { describe, it, expect } from "vitest";
import { hex, neighbors, isAdjacent, hexDistance } from "./hex";

describe("isAdjacent", () => {
  it("returns true for all six neighbors of the origin", () => {
    const origin = hex(0, 0);
    for (const n of neighbors(origin)) {
      expect(isAdjacent(origin, n)).toBe(true);
    }
  });

  it("is symmetric — isAdjacent(a, b) === isAdjacent(b, a)", () => {
    const a = hex(2, -1);
    const b = hex(3, -1);
    expect(isAdjacent(a, b)).toBe(true);
    expect(isAdjacent(b, a)).toBe(true);
  });

  it("returns false for the same hex", () => {
    const h = hex(1, 2);
    expect(isAdjacent(h, h)).toBe(false);
  });

  it("returns false for hexes two steps apart", () => {
    const a = hex(0, 0);
    const b = hex(2, 0);
    expect(isAdjacent(a, b)).toBe(false);
  });

  it("returns false for diagonal (non-neighbor) hexes", () => {
    const a = hex(0, 0);
    const b = hex(1, 1);
    expect(isAdjacent(a, b)).toBe(false);
  });

  it("works for hexes far from origin", () => {
    const a = hex(10, -5);
    for (const n of neighbors(a)) {
      expect(isAdjacent(a, n)).toBe(true);
    }
    expect(isAdjacent(a, hex(12, -5))).toBe(false);
  });
});

describe("hexDistance", () => {
  it("returns 0 for the same hex", () => {
    const h = hex(1, 2);
    expect(hexDistance(h, h)).toBe(0);
  });

  it("returns 1 for any neighbor", () => {
    const origin = hex(0, 0);
    for (const n of neighbors(origin)) {
      expect(hexDistance(origin, n)).toBe(1);
    }
  });

  it("returns 2 for a hex two steps away", () => {
    const a = hex(0, 0);
    const b = hex(2, 0);
    expect(hexDistance(a, b)).toBe(2);
  });

  it("is symmetric — hexDistance(a, b) === hexDistance(b, a)", () => {
    const a = hex(3, -1);
    const b = hex(0, 2);
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  it("computes longer distances across the origin", () => {
    const a = hex(-3, 0);
    const b = hex(3, 0);
    expect(hexDistance(a, b)).toBe(6);
  });
});
