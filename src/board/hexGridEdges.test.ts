import { describe, it, expect } from "vitest";
import {
  NO_HEX,
  SHORE_FADE,
  buildEdgeEmphasis,
  buildEdgeLinePositions,
  buildEdgeShoreFade,
  buildHexGridEdges,
  shoreFade,
} from "./hexGridEdges";
import { createWrap, hexGrid, hexRect, hexToWorld, offsetToHex } from "../game/hex";
import type { Hex } from "../game/hex";

const hex = (q: number, r: number): Hex => ({ q, r, s: -q - r });

// Rounded to 1e-3 so float noise (and -0 vs 0) does not split one point in two.
const round = (v: number) => Math.round(v * 1000) + 0;
const pointKey = (x: number, z: number) => `${round(x)},${round(z)}`;

/** Unordered key for a segment, independent of direction. */
const segmentKey = (ax: number, az: number, bx: number, bz: number) =>
  [pointKey(ax, az), pointKey(bx, bz)].sort().join("|");

/** The six full-size corner-to-corner edges of one flat-top hex. */
function hexEdgeKeys(h: Hex): string[] {
  const [cx, , cz] = hexToWorld(h);
  const corner = (i: number): [number, number] => {
    const a = (Math.PI / 3) * i;
    return [cx + Math.cos(a), cz - Math.sin(a)];
  };
  const keys: string[] = [];
  for (let i = 0; i < 6; i++) {
    const [ax, az] = corner(i);
    const [bx, bz] = corner((i + 1) % 6);
    keys.push(segmentKey(ax, az, bx, bz));
  }
  return keys;
}

function edgeKeys(edges: ReturnType<typeof buildHexGridEdges>): string[] {
  const keys: string[] = [];
  for (let e = 0; e < edges.count; e++) {
    const c = edges.corners;
    keys.push(segmentKey(c[e * 4], c[e * 4 + 1], c[e * 4 + 2], c[e * 4 + 3]));
  }
  return keys;
}

describe("buildHexGridEdges", () => {
  it("gives a lone hex its six edges, owned by that hex alone", () => {
    const edges = buildHexGridEdges([hex(0, 0)]);
    expect(edges.count).toBe(6);
    for (let e = 0; e < 6; e++) {
      expect(edges.owners[e * 2]).toBe(0);
      expect(edges.owners[e * 2 + 1]).toBe(NO_HEX);
    }
  });

  it("draws the edge shared by two neighbours only once", () => {
    const edges = buildHexGridEdges([hex(0, 0), hex(1, 0)]);
    expect(edges.count).toBe(11);
    const keys = edgeKeys(edges);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers every hex edge exactly once, at full hex size", () => {
    const hexes = hexGrid(2);
    const edges = buildHexGridEdges(hexes);
    const expected = new Set(hexes.flatMap(hexEdgeKeys));
    const actual = edgeKeys(edges);
    expect(actual.length).toBe(expected.size);
    expect(new Set(actual)).toEqual(expected);
  });

  it("matches the unique edge count of a radius-1 flower (7 hexes, 30 edges)", () => {
    expect(buildHexGridEdges(hexGrid(1)).count).toBe(30);
  });

  it("records both hexes as owners of a shared edge", () => {
    const edges = buildHexGridEdges([hex(0, 0), hex(1, 0)]);
    const shared: number[][] = [];
    for (let e = 0; e < edges.count; e++) {
      if (edges.owners[e * 2 + 1] !== NO_HEX) {
        shared.push([edges.owners[e * 2], edges.owners[e * 2 + 1]].sort());
      }
    }
    expect(shared).toEqual([[0, 1]]);
  });

  it("puts a shared edge on the midline between the two centres", () => {
    const a = hex(0, 0);
    const b = hex(0, 1);
    const edges = buildHexGridEdges([a, b]);
    const [ax, , az] = hexToWorld(a);
    const [bx, , bz] = hexToWorld(b);
    for (let e = 0; e < edges.count; e++) {
      if (edges.owners[e * 2 + 1] === NO_HEX) continue;
      const c = edges.corners;
      const mx = (c[e * 4] + c[e * 4 + 2]) / 2;
      const mz = (c[e * 4 + 1] + c[e * 4 + 3]) / 2;
      expect(mx).toBeCloseTo((ax + bx) / 2);
      expect(mz).toBeCloseTo((az + bz) / 2);
    }
  });

  it("is empty for no hexes", () => {
    expect(buildHexGridEdges([]).count).toBe(0);
  });
});

describe("buildEdgeLinePositions", () => {
  it("splits each edge into contiguous sub-segments at height y", () => {
    const edges = buildHexGridEdges([hex(0, 0)]);
    const subdivisions = 3;
    const positions = buildEdgeLinePositions(edges, 0.02, subdivisions);
    expect(positions.length).toBe(edges.count * subdivisions * 2 * 3);

    const c = edges.corners;
    for (let e = 0; e < edges.count; e++) {
      const base = e * subdivisions * 2 * 3;
      // Starts at the first corner and ends at the second.
      expect(positions[base]).toBeCloseTo(c[e * 4]);
      expect(positions[base + 2]).toBeCloseTo(c[e * 4 + 1]);
      const last = base + (subdivisions * 2 - 1) * 3;
      expect(positions[last]).toBeCloseTo(c[e * 4 + 2]);
      expect(positions[last + 2]).toBeCloseTo(c[e * 4 + 3]);
      // Each sub-segment starts where the previous one ended.
      for (let s = 1; s < subdivisions; s++) {
        const prevEnd = base + (s * 2 - 1) * 3;
        const start = base + s * 2 * 3;
        expect(positions[start]).toBeCloseTo(positions[prevEnd]);
        expect(positions[start + 2]).toBeCloseTo(positions[prevEnd + 2]);
      }
    }
    for (let v = 1; v < positions.length; v += 3) {
      expect(positions[v]).toBeCloseTo(0.02);
    }
  });
});

describe("buildEdgeEmphasis", () => {
  const edges = buildHexGridEdges([hex(0, 0), hex(1, 0), hex(5, 0)]);
  const subdivisions = 2;
  const vertsPerEdge = subdivisions * 2;

  const emphasisOfEdges = (values: Float32Array) => {
    const perEdge: number[] = [];
    for (let e = 0; e < edges.count; e++) {
      const slice = Array.from(values.slice(e * vertsPerEdge, (e + 1) * vertsPerEdge));
      expect(new Set(slice).size).toBe(1);
      perEdge.push(slice[0]);
    }
    return perEdge;
  };

  it("is zero without emphasis", () => {
    const values = buildEdgeEmphasis(edges, subdivisions, new Map());
    expect(values.length).toBe(edges.count * vertsPerEdge);
    expect(Array.from(values).every((v) => v === 0)).toBe(true);
  });

  it("gives every edge of an emphasised hex its value, others none", () => {
    const perEdge = emphasisOfEdges(buildEdgeEmphasis(edges, subdivisions, new Map([[2, 0.5]])));
    for (let e = 0; e < edges.count; e++) {
      const owned = edges.owners[e * 2] === 2 || edges.owners[e * 2 + 1] === 2;
      expect(perEdge[e]).toBe(owned ? 0.5 : 0);
    }
    expect(perEdge.filter((v) => v === 0.5).length).toBe(6);
  });

  it("uses the stronger emphasis of the two hexes on a shared edge", () => {
    const perEdge = emphasisOfEdges(
      buildEdgeEmphasis(edges, subdivisions, new Map([[0, 0.45], [1, 0.85]]))
    );
    for (let e = 0; e < edges.count; e++) {
      const a = edges.owners[e * 2];
      const b = edges.owners[e * 2 + 1];
      const touches1 = a === 1 || b === 1;
      const touches0 = a === 0 || b === 0;
      const expected = touches1 ? 0.85 : touches0 ? 0.45 : 0;
      expect(perEdge[e]).toBeCloseTo(expected);
    }
  });

  it("rewrites a provided buffer in place, clearing stale values", () => {
    const target = buildEdgeEmphasis(edges, subdivisions, new Map([[0, 1]]));
    const again = buildEdgeEmphasis(edges, subdivisions, new Map(), target);
    expect(again).toBe(target);
    expect(Array.from(again).every((v) => v === 0)).toBe(true);
  });
});

describe("shoreFade", () => {
  it("hides lines on land and right at the coast", () => {
    expect(shoreFade(0.5)).toBe(0);
    expect(shoreFade(0)).toBe(0);
    expect(shoreFade(-SHORE_FADE.clearStart)).toBe(0);
  });

  it("keeps lines at full strength in open water", () => {
    expect(shoreFade(-SHORE_FADE.clearEnd)).toBe(1);
    expect(shoreFade(-2)).toBe(1);
  });

  it("rises monotonically between the shore and open water", () => {
    let prev = 0;
    for (let d = SHORE_FADE.clearStart; d <= SHORE_FADE.clearEnd; d += 0.05) {
      const f = shoreFade(-d);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it("clears the surf band, which reaches ~0.62 offshore", () => {
    expect(SHORE_FADE.clearEnd).toBeGreaterThanOrEqual(0.6);
  });
});

describe("buildEdgeShoreFade", () => {
  it("samples the coast distance at each vertex", () => {
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0.1, 0, 0]);
    // Land at x < 0.2, open water beyond.
    const fade = buildEdgeShoreFade(positions, (x) => 0.2 - x);
    expect(fade.length).toBe(3);
    expect(fade[0]).toBe(0);
    expect(fade[1]).toBe(1);
    expect(fade[2]).toBe(0);
  });
});

describe("buildHexGridEdges on a map that wraps east–west (#36)", () => {
  const columns = 8;
  const rows = 5;
  const wrap = createWrap(columns);
  const hexes = hexRect(columns, rows);
  const edges = buildHexGridEdges(hexes, wrap);
  const indexOf = (h: Hex) => hexes.findIndex((x) => x.q === h.q && x.r === h.r);

  it("draws an edge across the seam once, owned by the hexes either side", () => {
    const east = offsetToHex(columns - 1, 2);
    const west = offsetToHex(0, 2);
    const pairs: number[] = [];
    for (let e = 0; e < edges.count; e++) {
      const owners = [edges.owners[e * 2], edges.owners[e * 2 + 1]].sort((a, b) => a - b);
      if (owners[0] === indexOf(west) && owners[1] === indexOf(east)) pairs.push(e);
    }
    expect(pairs).toHaveLength(1);
  });

  it("leaves only the north and south rows as border, so copies one wrap apart tile", () => {
    const [, , top] = hexToWorld(offsetToHex(0, 0));
    const [, , bottom] = hexToWorld(offsetToHex(1, rows - 1));
    for (let e = 0; e < edges.count; e++) {
      if (edges.owners[e * 2 + 1] !== NO_HEX) continue;
      const z = (edges.corners[e * 4 + 1] + edges.corners[e * 4 + 3]) / 2;
      expect(z < top + 0.1 || z > bottom - 0.1).toBe(true);
    }
  });

  it("matches the plain grid without a wrap", () => {
    expect(buildHexGridEdges(hexes, null)).toEqual(buildHexGridEdges(hexes));
  });
});
