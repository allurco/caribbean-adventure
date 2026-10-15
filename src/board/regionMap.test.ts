import { describe, it, expect } from "vitest";
import { regionAt, regionBorderEdges, regionLabels, regionNameStrength } from "./regionMap";
import { createWrap, hexRect, hexToOffset, hexToWorld, wrappedDistance } from "../game/hex";
import type { Hex, MapWrap } from "../game/hex";
import { generateMapFor } from "../game/mapRequest";
import { getMapPreset, MAP_PRESETS } from "../game/mapConfig";
import type { MapCell } from "../game/types";
import { SHIP_VIEW_DISTANCE } from "./shipView";
import { CAMERA_MAX_DISTANCE } from "./cameraBounds";

// Rounded to 1e-3 so float noise (and -0 vs 0) does not split one point in two.
const round = (v: number) => Math.round(v * 1000) + 0;
const pointKey = (x: number, z: number) => `${round(x)},${round(z)}`;
const segmentKey = (ax: number, az: number, bx: number, bz: number) => [pointKey(ax, az), pointKey(bx, bz)].sort().join("|");

/** The six corner-to-corner sides of a flat-top hex, as segment keys. */
function sides(h: Hex, shiftX = 0): string[] {
  const [cx, , cz] = hexToWorld(h);
  const corner = (i: number): [number, number] => [cx + shiftX + Math.cos((Math.PI / 3) * i), cz - Math.sin((Math.PI / 3) * i)];
  return Array.from({ length: 6 }, (_, i) => segmentKey(...corner(i), ...corner((i + 1) % 6)));
}

function edgeKeys(edges: ReturnType<typeof regionBorderEdges>): string[] {
  const keys: string[] = [];
  for (let e = 0; e < edges.count; e++) {
    const c = edges.corners;
    keys.push(segmentKey(c[e * 4], c[e * 4 + 1], c[e * 4 + 2], c[e * 4 + 3]));
  }
  return keys;
}

/** A plain water map of `columns × rows`, the west half region 0 and the east half region 1. */
function halves(columns: number, rows: number): MapCell[] {
  return hexRect(columns, rows).map((hex) => ({
    hex,
    terrain: "water",
    hasPort: false,
    elevation: 0,
    region: hexToOffset(hex).col < columns / 2 ? 0 : 1,
  }));
}

describe("regionBorderEdges (#239)", () => {
  it("draws the sides between two regions, each once: a 4×4 map split down the middle has 7", () => {
    // Column 1 is odd, so sits half a hex lower: each of its 4 hexes touches
    // column 2 at its own row and the one below, but the last has no row below.
    const cells = halves(4, 4);
    const keys = edgeKeys(regionBorderEdges(cells, null));
    expect(keys).toHaveLength(7);
    expect(new Set(keys).size).toBe(7);
    const between = (a: number, b: number) => {
      const west = cells.filter((c) => hexToOffset(c.hex).col === a).flatMap((c) => sides(c.hex));
      const east = new Set(cells.filter((c) => hexToOffset(c.hex).col === b).flatMap((c) => sides(c.hex)));
      return west.filter((k) => east.has(k));
    };
    expect(keys.sort()).toEqual(between(1, 2).sort());
  });

  it("draws the sides across the seam too on a wrapping map, once each", () => {
    const wrap = createWrap(4);
    const keys = edgeKeys(regionBorderEdges(halves(4, 4), wrap));
    expect(keys).toHaveLength(14);
    expect(new Set(keys).size).toBe(14);
  });

  it("draws nothing inside one region", () => {
    const cells = halves(4, 4).map((c) => ({ ...c, region: 0 }));
    expect(regionBorderEdges(cells, createWrap(4)).count).toBe(0);
  });

  it("names the two cells, one of each region, either side of every side", () => {
    const wrap = createWrap(getMapPreset("small").columns);
    const { cells } = generateMapFor({ mapSize: "small", mapSeed: 3 });
    const edges = regionBorderEdges(cells, wrap);
    expect(edges.count).toBeGreaterThan(0);
    for (let e = 0; e < edges.count; e++) {
      const a = cells[edges.owners[e * 2]];
      const b = cells[edges.owners[e * 2 + 1]];
      expect(a.region).not.toBe(b.region);
      expect(wrappedDistance(a.hex, b.hex, wrap)).toBe(1);
    }
  });
});

describe("regionLabels (#239)", () => {
  const maps = MAP_PRESETS.flatMap((preset) =>
    [11, 12, 13, 14, 15].map((mapSeed) => ({ preset, mapSeed, wrap: createWrap(preset.columns) as MapWrap }))
  );

  it("gives each region one label, over open water of its own, clear of land", () => {
    for (const { preset, mapSeed, wrap } of maps) {
      const { cells, regions } = generateMapFor({ mapSize: preset.id, mapSeed });
      const labels = regionLabels(cells, regions, wrap);
      expect(labels.map((l) => l.region)).toEqual([0, 1, 2, 3, 4]);
      const land = cells.filter((c) => c.terrain !== "water");
      for (const label of labels) {
        const at = `${preset.id} seed ${mapSeed} region ${label.region}`;
        const cell = cells.find((c) => c.hex.q === label.hex.q && c.hex.r === label.hex.r)!;
        expect(cell.terrain, at).toBe("water");
        expect(cell.region, at).toBe(label.region);
        expect(label.name, at).toBe(regions[label.region].name);
        expect(Math.min(...land.map((l) => wrappedDistance(l.hex, label.hex, wrap))), at).toBeGreaterThanOrEqual(2);
        const [x, , z] = hexToWorld(label.hex);
        expect([label.x, label.z]).toEqual([x, z]);
      }
    }
  });

  it("skips a region with no cells rather than fail", () => {
    const cells = halves(6, 4);
    const regions = [
      { id: 0, nation: "England" as const, name: "West", neighbours: [1] },
      { id: 1, nation: "France" as const, name: "East", neighbours: [0] },
      { id: 2, nation: "Spain" as const, name: "Nowhere", neighbours: [] },
    ];
    expect(regionLabels(cells, regions, null).map((l) => l.region)).toEqual([0, 1]);
  });

  it("is the same for the same map", () => {
    const { cells, regions } = generateMapFor({ mapSize: "medium", mapSeed: 99 });
    const wrap = createWrap(getMapPreset("medium").columns);
    expect(regionLabels(cells, regions, wrap)).toEqual(regionLabels(structuredClone(cells), structuredClone(regions), wrap));
  });

  it("sits near the middle of its region's islands, not out at its far edge", () => {
    for (const { preset, mapSeed, wrap } of maps) {
      const { cells, regions } = generateMapFor({ mapSize: preset.id, mapSeed });
      for (const label of regionLabels(cells, regions, wrap)) {
        const islands = cells.filter((c) => c.terrain === "island" && c.region === label.region);
        const nearestLand = Math.min(...islands.map((c) => wrappedDistance(c.hex, label.hex, wrap)));
        // Within a few hexes of its own land, so the name reads as that cluster's.
        expect(nearestLand, `${preset.id} seed ${mapSeed} region ${label.region}`).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe("regionNameStrength (#239)", () => {
  it("is whole at the overview, about half at mid zoom, gone at ship zoom, easing between", () => {
    expect(regionNameStrength(CAMERA_MAX_DISTANCE)).toBe(1);
    expect(regionNameStrength(20)).toBe(1);
    expect(regionNameStrength(12)).toBeGreaterThan(0.3);
    expect(regionNameStrength(12)).toBeLessThan(0.7);
    expect(regionNameStrength(SHIP_VIEW_DISTANCE)).toBe(0);
    expect(regionNameStrength(SHIP_VIEW_DISTANCE + 2)).toBe(0);
    let prev = 0;
    for (let d = SHIP_VIEW_DISTANCE; d <= CAMERA_MAX_DISTANCE; d += 0.5) {
      const o = regionNameStrength(d);
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
  });
});

describe("regionAt (#239)", () => {
  it("names the region a hex lies in, for the hover tooltip", () => {
    const { cells, regions } = generateMapFor({ mapSize: "small", mapSeed: 4 });
    for (const cell of cells.filter((_, i) => i % 7 === 0)) {
      expect(regionAt(cells, regions, cell.hex)).toBe(regions[cell.region!]);
    }
  });

  it("is undefined off the map or on a map without regions", () => {
    const { cells, regions } = generateMapFor({ mapSize: "small", mapSeed: 4 });
    expect(regionAt(cells, regions, { q: -50, r: 3, s: 47 })).toBeUndefined();
    expect(regionAt(cells, [], cells[0].hex)).toBeUndefined();
  });
});
