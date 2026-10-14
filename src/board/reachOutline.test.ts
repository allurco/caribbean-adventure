import { describe, it, expect } from "vitest";
import { clipToWater, hexCorners, reachEdges, ribbonPositions, waterHexTriangles } from "./reachOutline";
import { turnReach } from "../game/reach";
import { hex, hexGrid, hexToWorld, NO_WRAP } from "../game/hex";
import type { MapCell } from "../game/types";

const disc = (radius: number, land: string[] = []): MapCell[] =>
  hexGrid(radius).map((h) => ({
    hex: h,
    terrain: land.includes(`${h.q},${h.r}`) ? "island" : "water",
    hasPort: false,
    elevation: 0,
  }));

const sea = () => -1;

describe("hexCorners", () => {
  it("lies one radius from the centre, matching hexToWorld's spacing", () => {
    for (const [x, z] of hexCorners([0, 0])) expect(Math.hypot(x, z)).toBeCloseTo(1, 6);
    // Neighbours share two corners
    const [nx, , nz] = hexToWorld(hex(1, 0));
    const mine = hexCorners([0, 0]);
    const theirs = hexCorners([nx, nz]);
    const shared = mine.filter((c) => theirs.some((d) => Math.hypot(c[0] - d[0], c[1] - d[1]) < 1e-9));
    expect(shared).toHaveLength(2);
  });
});

describe("reachEdges", () => {
  it("outlines one move's reach with the ring of 18 outer edges and no inner ring", () => {
    const reach = turnReach(hex(0, 0), 1, disc(4), NO_WRAP);
    const { boundary, rings } = reachEdges(reach, disc(4));
    expect(boundary).toHaveLength(18);
    expect(rings).toHaveLength(0);
  });

  it("draws a ring where the cost steps from 1 to 2", () => {
    const reach = turnReach(hex(0, 0), 2, disc(4), NO_WRAP);
    const { boundary, rings } = reachEdges(reach, disc(4));
    expect(boundary).toHaveLength(30);
    expect(rings).toHaveLength(18);
  });

  it("leaves the coast unlined: no boundary edge faces land", () => {
    const cells = disc(4, ["2,0"]);
    const reach = turnReach(hex(0, 0), 1, cells, NO_WRAP);
    const open = reachEdges(reach, disc(4)).boundary.length;
    // (2,0) borders one hex of the ring, (1,0)
    expect(reachEdges(reach, cells).boundary.length).toBe(open - 1);
  });

  it("every edge is one hex side long", () => {
    const reach = turnReach(hex(0, 0), 3, disc(5), NO_WRAP);
    const { boundary, rings } = reachEdges(reach, disc(5));
    for (const { a, b } of [...boundary, ...rings]) expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(1, 6);
  });
});

describe("clipToWater", () => {
  it("keeps a segment over water whole, in pieces", () => {
    const out = clipToWater([{ a: [0, 0], b: [1, 0] }], sea, 4);
    expect(out).toHaveLength(4);
    expect(out[0].a).toEqual([0, 0]);
    expect(out[3].b).toEqual([1, 0]);
  });

  it("drops the pieces over land", () => {
    const out = clipToWater([{ a: [0, 0], b: [1, 0] }], (x) => (x > 0.5 ? 0.2 : -0.2), 4);
    expect(out).toHaveLength(2);
    for (const s of out) expect(Math.max(s.a[0], s.b[0])).toBeLessThanOrEqual(0.5);
  });
});

describe("ribbonPositions", () => {
  it("is two triangles per segment, as wide as asked, at the height asked", () => {
    const pos = ribbonPositions([{ a: [0, 0], b: [1, 0] }], 0.1, 0.02);
    expect(pos).toHaveLength(18);
    const zs = [];
    for (let i = 0; i < 6; i++) {
      expect(pos[i * 3 + 1]).toBeCloseTo(0.02, 6);
      zs.push(pos[i * 3 + 2]);
    }
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.1, 6);
  });
});

describe("waterHexTriangles", () => {
  it("covers a hex over open water with every piece", () => {
    const pos = waterHexTriangles([[0, 0]], sea, 0, 1, 3);
    // 6 wedges × 9 pieces × 3 vertices × 3 numbers
    expect(pos).toHaveLength(6 * 9 * 9);
  });

  it("keeps nothing over land and only the water side of a coast", () => {
    expect(waterHexTriangles([[0, 0]], () => 1, 0)).toHaveLength(0);
    const half = waterHexTriangles([[0, 0]], (x) => (x > 0 ? 1 : -1), 0, 1, 3);
    expect(half.length).toBeGreaterThan(0);
    expect(half.length).toBeLessThan(6 * 9 * 9);
    for (let i = 0; i < half.length; i += 9) expect((half[i] + half[i + 3] + half[i + 6]) / 3).toBeLessThanOrEqual(0);
  });
});
