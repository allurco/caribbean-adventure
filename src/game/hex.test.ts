import { describe, it, expect } from "vitest";
import {
  hex,
  neighbors,
  isAdjacent,
  hexDistance,
  hexGrid,
  hexToWorld,
  worldToHex,
  createWrap,
  canonicalHex,
  nearestImage,
  wrappedNeighbors,
  wrappedDistance,
  wrappedEquals,
  wrapWorldWidth,
  hexRect,
  hexToOffset,
  NO_WRAP,
  type Hex,
} from "./hex";

// Compare as strings so -0 and 0 (which hex() produces for s) don't differ.
const key = (h: Hex): string => `${h.q + 0},${h.r + 0},${h.s + 0}`;

describe("createWrap", () => {
  it("accepts an even column count", () => {
    expect(createWrap(8)).toEqual({ columns: 8 });
  });

  it("rejects an odd column count, since flat-top columns only line up across the seam in pairs", () => {
    expect(() => createWrap(7)).toThrow(/even/);
  });

  it("rejects non-integer and too-narrow widths", () => {
    expect(() => createWrap(6.5)).toThrow();
    expect(() => createWrap(2)).toThrow();
    expect(() => createWrap(0)).toThrow();
    expect(() => createWrap(-4)).toThrow();
  });
});

describe("hexRect", () => {
  it("lays out columns × rows hexes in canonical columns 0..columns-1", () => {
    const cells = hexRect(8, 5);
    expect(cells).toHaveLength(40);
    const qs = new Set(cells.map((h) => h.q));
    expect([...qs].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps every row horizontal (offset row 0..rows-1 in every column)", () => {
    for (const h of hexRect(6, 4)) {
      const { col, row } = hexToOffset(h);
      expect(col).toBe(h.q);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(4);
    }
  });

  it("is already canonical under its own wrap", () => {
    const wrap = createWrap(6);
    for (const h of hexRect(6, 4)) {
      expect(key(canonicalHex(h, wrap))).toBe(key(h));
    }
  });
});

describe("canonicalHex", () => {
  const wrap = createWrap(8);

  it("leaves hexes inside columns 0..7 untouched", () => {
    expect(key(canonicalHex(hex(3, -1), wrap))).toBe(key(hex(3, -1)));
  });

  it("brings a hex one column past the east edge back to column 0 on the same row", () => {
    const east = hex(7, -3); // column 7, row 0
    const pastEast = hex(8, -4); // its east-south... one step (+1, -1) further east
    const c = canonicalHex(pastEast, wrap);
    expect(c.q).toBe(0);
    expect(hexToOffset(c).row).toBe(hexToOffset(pastEast).row);
    expect(hexToOffset(east).row).toBe(0);
  });

  it("brings a hex west of column 0 to the east columns", () => {
    const c = canonicalHex(hex(-1, 0), wrap);
    expect(c.q).toBe(7);
    expect(hexToOffset(c).row).toBe(hexToOffset(hex(-1, 0)).row);
  });

  it("is a pure translation by the wrap period (q ± columns, r ∓ columns/2)", () => {
    const h = hex(2, 1);
    expect(key(canonicalHex(hex(2 + 8, 1 - 4), wrap))).toBe(key(h));
    expect(key(canonicalHex(hex(2 - 16, 1 + 8), wrap))).toBe(key(h));
  });

  it("never yields -0", () => {
    const c = canonicalHex(hex(8, -4), wrap);
    expect(Object.is(c.q, -0) || Object.is(c.r, -0) || Object.is(c.s, -0)).toBe(false);
  });

  it("is the identity with no wrap", () => {
    expect(key(canonicalHex(hex(-30, 4), NO_WRAP))).toBe(key(hex(-30, 4)));
  });
});

describe("wrappedNeighbors", () => {
  const wrap = createWrap(8);
  const grid = hexRect(8, 6);
  const onGrid = new Set(grid.map(key));

  it("makes east-edge and west-edge hexes neighbours", () => {
    const eastEdge = hex(7, 0); // column 7
    const ns = wrappedNeighbors(eastEdge, wrap);
    const westNs = ns.filter((n) => n.q === 0);
    expect(westNs.length).toBe(2);
    for (const w of westNs) {
      expect(wrappedNeighbors(w, wrap).map(key)).toContain(key(eastEdge));
    }
  });

  it("always returns six distinct canonical hexes", () => {
    for (const h of grid) {
      const ns = wrappedNeighbors(h, wrap);
      expect(new Set(ns.map(key)).size).toBe(6);
      for (const n of ns) {
        expect(n.q).toBeGreaterThanOrEqual(0);
        expect(n.q).toBeLessThan(8);
      }
    }
  });

  it("gives every interior-row hex six on-grid neighbours, including on the seam columns", () => {
    for (const h of grid) {
      const { row } = hexToOffset(h);
      if (row === 0 || row === 5) continue;
      expect(wrappedNeighbors(h, wrap).every((n) => onGrid.has(key(n)))).toBe(true);
    }
  });

  it("matches plain neighbors with no wrap", () => {
    expect(wrappedNeighbors(hex(0, 0), NO_WRAP).map(key)).toEqual(neighbors(hex(0, 0)).map(key));
  });
});

describe("wrappedDistance", () => {
  const wrap = createWrap(8);

  it("is 1 between an east-edge hex and its west-edge neighbour", () => {
    const eastEdge = hex(7, -3);
    for (const n of wrappedNeighbors(eastEdge, wrap)) {
      expect(wrappedDistance(eastEdge, n, wrap)).toBe(1);
    }
  });

  it("takes the shorter way round the seam", () => {
    const west = hex(0, 0); // column 0, row 0
    const east = hex(7, -3); // column 7, row 0
    expect(hexDistance(west, east)).toBe(7);
    expect(wrappedDistance(west, east, wrap)).toBe(1);
  });

  it("still uses the direct route when it is shorter", () => {
    expect(wrappedDistance(hex(1, 0), hex(3, -1), wrap)).toBe(2);
  });

  it("is symmetric and never more than the plain distance", () => {
    const grid = hexRect(8, 6);
    for (const a of grid) {
      for (const b of grid) {
        const d = wrappedDistance(a, b, wrap);
        expect(d).toBe(wrappedDistance(b, a, wrap));
        expect(d).toBeLessThanOrEqual(hexDistance(a, b));
      }
    }
  });

  it("agrees with a breadth-first walk over wrapped neighbours", () => {
    const grid = hexRect(8, 5);
    const onGrid = new Set(grid.map(key));
    const start = hex(0, 2);
    const dist = new Map<string, number>([[key(start), 0]]);
    const queue: Hex[] = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of wrappedNeighbors(cur, wrap)) {
        if (!onGrid.has(key(n)) || dist.has(key(n))) continue;
        dist.set(key(n), dist.get(key(cur))! + 1);
        queue.push(n);
      }
    }
    for (const h of grid) {
      // An unbounded cylinder can only be shorter than one clipped to five rows.
      expect(wrappedDistance(start, h, wrap)).toBeLessThanOrEqual(dist.get(key(h))!);
    }
    // Straight across the seam the clipped walk is exact.
    expect(wrappedDistance(start, hex(7, -1), wrap)).toBe(dist.get(key(hex(7, -1))));
  });

  it("equals hexDistance with no wrap", () => {
    expect(wrappedDistance(hex(-3, 0), hex(3, 0), NO_WRAP)).toBe(6);
  });
});

describe("wrappedEquals", () => {
  const wrap = createWrap(8);

  it("treats copies of a hex one wrap apart as the same hex", () => {
    expect(wrappedEquals(hex(1, 0), hex(9, -4), wrap)).toBe(true);
    expect(wrappedEquals(hex(1, 0), hex(2, 0), wrap)).toBe(false);
  });

  it("is plain equality with no wrap", () => {
    expect(wrappedEquals(hex(1, 0), hex(9, -4), NO_WRAP)).toBe(false);
  });
});

describe("nearestImage", () => {
  const wrap = createWrap(8);

  it("returns the copy of the target on the near side of the seam", () => {
    const from = hex(7, -3);
    const img = nearestImage(from, hex(0, 0), wrap);
    expect(key(img)).toBe(key(hex(8, -4)));
    expect(hexDistance(from, img)).toBe(1);
  });

  it("returns the target unchanged when it is already nearest", () => {
    expect(key(nearestImage(hex(1, 0), hex(3, -1), wrap))).toBe(key(hex(3, -1)));
  });
});

describe("wrapWorldWidth", () => {
  it("is the world-space X shift of one wrap, with no Z shift", () => {
    const wrap = createWrap(8);
    const width = wrapWorldWidth(wrap);
    const [x0, , z0] = hexToWorld(hex(2, 1));
    const [x1, , z1] = hexToWorld(hex(2 + 8, 1 - 4));
    expect(x1 - x0).toBeCloseTo(width);
    expect(z1).toBeCloseTo(z0);
  });

  it("is Infinity with no wrap", () => {
    expect(wrapWorldWidth(NO_WRAP)).toBe(Infinity);
  });
});

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
  const axial = key;

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
