import { describe, it, expect } from "vitest";
import {
  placeRegionNames,
  regionNameFootprint,
  REGION_NAME_MAX_SIZE,
  REGION_NAME_MIN_SIZE,
  type RegionNamePlacement,
} from "./regionNamePlacement";
import { canonicalHex, createWrap, hexKey, hexRect, hexToOffset, hexToWorld, worldToHex, wrapWorldWidth } from "../game/hex";
import type { MapWrap } from "../game/hex";
import { generateMapFor } from "../game/mapRequest";
import { getMapPreset } from "../game/mapConfig";
import type { MapCell, Region } from "../game/types";

const region = (id: number, name: string): Region => ({ id, nation: "Spain", name, neighbours: [] });

/** A plain water map of `columns × rows`, all region 0. */
function sea(columns: number, rows: number, terrainAt: (col: number, row: number) => MapCell["terrain"] = () => "water"): MapCell[] {
  return hexRect(columns, rows).map((hex) => {
    const { col, row } = hexToOffset(hex);
    const terrain = terrainAt(col, row);
    return { hex, terrain, hasPort: false, elevation: terrain === "island" ? 2 : 0, region: 0 };
  });
}

/** Points over a placement's text block, every 0.1 units, edges included. */
function samples(p: RegionNamePlacement): [number, number][] {
  const corners = regionNameFootprint(p);
  const [a, b, , d] = corners;
  const points: [number, number][] = [];
  const along = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1);
  const across = Math.ceil(Math.hypot(d[0] - a[0], d[1] - a[1]) / 0.1);
  for (let i = 0; i <= along; i++) {
    for (let j = 0; j <= across; j++) {
      const s = i / along;
      const t = j / across;
      points.push([a[0] + (b[0] - a[0]) * s + (d[0] - a[0]) * t, a[1] + (b[1] - a[1]) * s + (d[1] - a[1]) * t]);
    }
  }
  return points;
}

/** The short way round in x on a wrapping map. */
function dx(a: number, b: number, wrap: MapWrap): number {
  const d = a - b;
  if (!wrap) return d;
  const w = wrapWorldWidth(wrap);
  return d - w * Math.round(d / w);
}

/** Distance from (x, z) to the nearest sample of a placement. */
function nearest(p: RegionNamePlacement, x: number, z: number, wrap: MapWrap): number {
  return Math.min(...samples(p).map(([px, pz]) => Math.hypot(dx(px, x, wrap), pz - z)));
}

describe("placeRegionNames (#239)", () => {
  it("writes a region's whole name on one line, at full size, across a wide open sea", () => {
    const cells = sea(20, 12);
    const [placement] = placeRegionNames(cells, [region(0, "the Orange Shoals")], null);
    expect(placement.region).toBe(0);
    expect(placement.lines).toEqual(["THE ORANGE SHOALS"]);
    expect(placement.size).toBe(REGION_NAME_MAX_SIZE);
  });

  it("lies across the sea, not along the map's edge rows, when there is room inside", () => {
    // Land fills the middle rows but for a wide lane: the rim is the widest
    // water, yet the name takes the lane
    const cells = sea(24, 20, (_, row) => (row >= 6 && row <= 13 && row !== 9 && row !== 10 ? "island" : "water"));
    const [placement] = placeRegionNames(cells, [region(0, "Zeeland Waters")], null);
    for (const [, z] of samples(placement)) {
      expect(z).toBeGreaterThan(Math.sqrt(3) * 2);
      expect(z).toBeLessThan(Math.sqrt(3) * 17);
    }
  });

  it("keeps every letter in the region's own water hexes", () => {
    // Region 0 to the west, region 1 to the east: each name stays on its own side
    const cells = sea(24, 12).map((c) => ({ ...c, region: hexToOffset(c.hex).col < 12 ? 0 : 1 }));
    const placements = placeRegionNames(cells, [region(0, "the Mar de Castilla"), region(1, "the Orange Shoals")], null);
    expect(placements).toHaveLength(2);
    const byKey = new Map(cells.map((c) => [hexKey(c.hex), c]));
    for (const p of placements) {
      for (const [x, z] of samples(p)) {
        const cell = byKey.get(hexKey(worldToHex(x, z)));
        expect(cell?.region).toBe(p.region);
      }
    }
  });

  it("shrinks a name, then splits it onto two lines, where the sea is narrow", () => {
    // A water channel 5 columns wide between land, 30 rows tall: no room across
    const cells = sea(15, 30, (col) => (col >= 5 && col <= 9 ? "water" : "island"));
    const [placement] = placeRegionNames(cells, [region(0, "the Windward Passage")], null);
    expect(placement.lines).toEqual(["THE WINDWARD", "PASSAGE"]);
    expect(placement.size).toBeLessThan(REGION_NAME_MAX_SIZE);
    expect(placement.size).toBeGreaterThanOrEqual(REGION_NAME_MIN_SIZE);
  });

  it("turns a name along a long diagonal stretch of water, like chart lettering", () => {
    // Water only in a band running north-west to south-east
    const cells = sea(30, 30).map((c) => {
      const [x, , z] = hexToWorld(c.hex);
      const off = Math.abs((x - 22) * Math.sin(Math.PI / 6) - (z - 26) * Math.cos(Math.PI / 6));
      return off < 2.6 ? c : { ...c, terrain: "island" as const, elevation: 2 as const };
    });
    const [placement] = placeRegionNames(cells, [region(0, "the Spanish Main")], null);
    expect(placement.lines).toEqual(["THE SPANISH MAIN"]);
    expect(placement.angle).toBeGreaterThan(0.2);
  });

  it("names no region that has no water wide enough for its name at the smallest size", () => {
    const cells = sea(6, 6, (col) => (col === 3 ? "water" : "island"));
    expect(placeRegionNames(cells, [region(0, "the Orange Shoals")], null)).toEqual([]);
  });

  it("is the same placement every time for the same map", () => {
    const { cells, regions } = generateMapFor({ mapSize: "small", mapSeed: 1 });
    const wrap = createWrap(getMapPreset("small").columns);
    expect(placeRegionNames(cells, regions, wrap)).toEqual(placeRegionNames(cells, regions, wrap));
  });

  describe.each([
    ["small", 1],
    ["small", 4],
    ["medium", 7],
    ["medium", 2],
    ["large", 3],
  ] as const)("on the generated %s map, seed %i", (mapSize, mapSeed) => {
    const { cells, regions } = generateMapFor({ mapSize, mapSeed });
    // The game's maps wrap east–west (Game.ts setup)
    const wrap = createWrap(getMapPreset(mapSize).columns);
    const placements = placeRegionNames(cells, regions, wrap);
    const land = cells.filter((c) => c.terrain !== "water");
    const ports = cells.filter((c) => c.hasPort);

    it("names every region, in full", () => {
      expect(placements.map((p) => p.region)).toEqual(regions.map((r) => r.id));
      for (const p of placements) expect(p.lines.join(" ")).toBe(regions[p.region].name.toUpperCase());
    });

    it("keeps every letter off land and reef by more than a noisy coast reaches (a hex's corner plus 0.25)", () => {
      for (const p of placements) {
        for (const c of land) {
          const [x, , z] = hexToWorld(c.hex);
          expect(nearest(p, x, z, wrap)).toBeGreaterThan(1.25);
        }
      }
    });

    it("keeps clear of every port's name label, which floats over the town and reads north of it", () => {
      for (const p of placements) {
        for (const port of ports) {
          const [px, , pz] = hexToWorld(port.hex);
          for (const [x, z] of samples(p)) {
            const inLabel = Math.abs(dx(x, px, wrap)) < 1.4 && z > pz - 2.2 && z < pz + 0.6;
            expect(inLabel).toBe(false);
          }
        }
      }
    });

    it("stays on the map", () => {
      const keys = new Set(cells.map((c) => hexKey(c.hex)));
      for (const p of placements) {
        for (const [x, z] of samples(p)) expect(keys.has(hexKey(canonicalHex(worldToHex(x, z), wrap)))).toBe(true);
      }
    });
  });
});
