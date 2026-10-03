import { describe, it, expect } from "vitest";
import { hex, neighbors, isAdjacent, hexDistance, hexGrid, hexToWorld, worldToHex, type Hex } from "./hex";

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

describe("worldToHex", () => {
  // Compare as strings so -0 and 0 (which hex() produces for s) don't differ.
  const axial = (h: Hex): string => `${h.q + 0},${h.r + 0},${h.s + 0}`;

  it("is the inverse of hexToWorld at every hex centre", () => {
    for (const h of hexGrid(4)) {
      const [x, , z] = hexToWorld(h);
      expect(axial(worldToHex(x, z))).toEqual(axial(h));
    }
  });

  it("keeps points well inside a hex in that hex", () => {
    // The inradius of a size-1 flat-top hex is √3/2; stay just inside it in every direction.
    const inside = (Math.sqrt(3) / 2) * 0.95;
    for (const h of hexGrid(2)) {
      const [cx, , cz] = hexToWorld(h);
      for (let a = 0; a < 12; a++) {
        const angle = (a / 12) * 2 * Math.PI;
        expect(axial(worldToHex(cx + inside * Math.cos(angle), cz + inside * Math.sin(angle)))).toEqual(axial(h));
      }
    }
  });

  it("returns the neighbour once a point crosses the shared edge", () => {
    const origin = hex(0, 0);
    for (const n of neighbors(origin)) {
      const [nx, , nz] = hexToWorld(n);
      // 55% of the way to the neighbour's centre is past the shared edge (at 50%).
      expect(axial(worldToHex(nx * 0.55, nz * 0.55))).toEqual(axial(n));
    }
  });
});
