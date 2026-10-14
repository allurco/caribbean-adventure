import { describe, it, expect } from "vitest";
import { turnReach, routeTo, reachCost } from "./reach";
import { hex, hexEquals, hexGrid, hexRect, offsetToHex, createWrap, NO_WRAP, wrappedDistance } from "./hex";
import type { Hex } from "./hex";
import type { MapCell } from "./mapGenerator";

type Terrain = MapCell["terrain"];

/** A rectangle of water with some cells changed. */
function sea(columns: number, rows: number, changes: Record<string, Partial<MapCell>> = {}): MapCell[] {
  return hexRect(columns, rows).map((h) => ({
    hex: h,
    terrain: "water" as Terrain,
    hasPort: false,
    elevation: 0,
    ...changes[key(h)],
  }));
}

/** A disc of water of `radius` round the origin with some cells changed. */
function disc(radius: number, changes: Record<string, Partial<MapCell>> = {}): MapCell[] {
  return hexGrid(radius).map((h) => ({ hex: h, terrain: "water" as Terrain, hasPort: false, elevation: 0, ...changes[key(h)] }));
}

function key(h: Hex): string {
  return `${h.q},${h.r}`;
}
const at = (col: number, row: number) => offsetToHex(col, row);

describe("turnReach", () => {
  it("reaches nothing with no moves left", () => {
    const cells = sea(7, 7);
    const reach = turnReach(at(3, 3), 0, cells, NO_WRAP);
    expect(reach.hexes).toEqual([]);
  });

  it("reaches the ring of neighbours at cost 1 with one move", () => {
    const cells = sea(7, 7);
    const reach = turnReach(at(3, 3), 1, cells, NO_WRAP);
    expect(reach.hexes).toHaveLength(6);
    expect(reach.hexes.every((s) => s.cost === 1)).toBe(true);
  });

  it("reaches every hex within three moves on open water, costed by distance", () => {
    const cells = sea(9, 9);
    const start = at(4, 4);
    const reach = turnReach(start, 3, cells, NO_WRAP);
    // 6 + 12 + 18 hexes in rings 1..3
    expect(reach.hexes).toHaveLength(36);
    for (const s of reach.hexes) expect(s.cost).toBe(wrappedDistance(start, s.hex, NO_WRAP));
    expect(reach.hexes.some((s) => hexEquals(s.hex, start))).toBe(false);
  });

  it("routes round an island, so the hex behind it costs more", () => {
    const start = hex(0, 0);
    // (1,-1) and (1,0) are land: (2,-1) is two hexes away straight over them, four round them
    const cells = disc(4, { [key(hex(1, -1))]: { terrain: "island" }, [key(hex(1, 0))]: { terrain: "island" } });
    expect(reachCost(turnReach(start, 3, cells, NO_WRAP), hex(2, -1))).toBeUndefined();
    const reach = turnReach(start, 4, cells, NO_WRAP);
    expect(reachCost(reach, hex(2, -1))).toBe(4);
    expect(reachCost(reach, hex(1, 0))).toBeUndefined();
    expect(reachCost(reach, hex(1, -1))).toBeUndefined();
  });

  it("lets a shallow-draft ship over reefs and keeps a deep-draft ship off them", () => {
    const cells = sea(7, 7, { [key(at(4, 3))]: { terrain: "reef" } });
    const shallow = turnReach(at(3, 3), 1, cells, NO_WRAP, { shallowDraft: true });
    const deep = turnReach(at(3, 3), 1, cells, NO_WRAP, { shallowDraft: false });
    expect(reachCost(shallow, at(4, 3))).toBe(1);
    expect(reachCost(deep, at(4, 3))).toBeUndefined();
    expect(deep.hexes).toHaveLength(5);
  });

  it("routes round occupied hexes", () => {
    const blocker = hex(1, 0);
    const reach = turnReach(hex(0, 0), 3, disc(4), NO_WRAP, { occupied: [blocker] });
    expect(reachCost(reach, blocker)).toBeUndefined();
    // (2,0) is two hexes away only through the blocker; round it is three
    expect(reachCost(reach, hex(2, 0))).toBe(3);
  });

  it("stops at a stop hex (a port's docking hex) without sailing on through it", () => {
    // A corridor one hex wide: start, dock, beyond
    const corridor = [hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0)];
    const cells: MapCell[] = corridor.map((h) => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 }));
    const reach = turnReach(hex(0, 0), 3, cells, NO_WRAP, { stops: [hex(1, 0)] });
    expect(reachCost(reach, hex(1, 0))).toBe(1);
    expect(reachCost(reach, hex(2, 0))).toBeUndefined();
  });

  it("leaves the stop hex it starts on", () => {
    const corridor = [hex(0, 0), hex(1, 0), hex(2, 0)];
    const cells: MapCell[] = corridor.map((h) => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 }));
    const reach = turnReach(hex(0, 0), 3, cells, NO_WRAP, { stops: [hex(0, 0)] });
    expect(reachCost(reach, hex(2, 0))).toBe(2);
  });

  it("crosses the seam on a wrapped map, keeping every hex canonical", () => {
    const wrap = createWrap(8);
    const cells = sea(8, 6);
    const eastEdge = at(7, 2);
    const reach = turnReach(eastEdge, 2, cells, wrap);
    const westEdge = at(0, 2);
    expect(reachCost(reach, westEdge)).toBe(1);
    expect(reachCost(reach, at(1, 2))).toBe(2);
    for (const s of reach.hexes) expect(s.hex.q).toBeGreaterThanOrEqual(0);
    for (const s of reach.hexes) expect(s.hex.q).toBeLessThan(8);
  });

  it("does not cross the edge with no wrap", () => {
    const cells = sea(8, 6);
    const reach = turnReach(at(7, 2), 2, cells, NO_WRAP);
    expect(reachCost(reach, at(0, 2))).toBeUndefined();
  });
});

describe("routeTo", () => {
  it("is the hexes after the start, ending on the target, each one step from the last", () => {
    const cells = sea(9, 9);
    const start = at(4, 4);
    const reach = turnReach(start, 3, cells, NO_WRAP);
    const target = at(7, 4);
    const route = routeTo(reach, target);
    expect(route).toHaveLength(3);
    expect(hexEquals(route[2], target)).toBe(true);
    let prev = start;
    for (const h of route) {
      expect(wrappedDistance(prev, h, NO_WRAP)).toBe(1);
      prev = h;
    }
  });

  it("is one hex for a neighbour", () => {
    const cells = sea(7, 7);
    const reach = turnReach(at(3, 3), 3, cells, NO_WRAP);
    expect(routeTo(reach, at(4, 3))).toHaveLength(1);
  });

  it("is empty for a hex out of reach, the start itself, or off the map", () => {
    const cells = sea(9, 9);
    const start = at(4, 4);
    const reach = turnReach(start, 2, cells, NO_WRAP);
    expect(routeTo(reach, at(8, 4))).toEqual([]);
    expect(routeTo(reach, start)).toEqual([]);
    expect(routeTo(reach, hex(40, 40))).toEqual([]);
  });

  it("goes round an island", () => {
    const island = hex(1, 0);
    const reach = turnReach(hex(0, 0), 3, disc(4, { [key(island)]: { terrain: "island" } }), NO_WRAP);
    const route = routeTo(reach, hex(2, 0));
    expect(route).toHaveLength(3);
    expect(route.some((h) => hexEquals(h, island))).toBe(false);
  });

  it("crosses the seam the short way", () => {
    const wrap = createWrap(8);
    const cells = sea(8, 6);
    const reach = turnReach(at(7, 2), 3, cells, wrap);
    const route = routeTo(reach, at(1, 2));
    expect(route).toHaveLength(2);
    expect(hexEquals(route[1], at(1, 2))).toBe(true);
  });

  it("finds the target by any copy of it on a wrapped map", () => {
    const wrap = createWrap(8);
    const cells = sea(8, 6);
    const reach = turnReach(at(7, 2), 3, cells, wrap);
    const target = at(0, 2);
    const image: Hex = { q: target.q + 8, r: target.r - 4, s: target.s - 4 };
    expect(routeTo(reach, image)).toHaveLength(1);
  });
});
