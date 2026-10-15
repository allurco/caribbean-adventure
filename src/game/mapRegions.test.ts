import { beforeAll, describe, it, expect } from "vitest";
import { generateMapFor } from "./mapRequest";
import type { MapRequest } from "./mapRequest";
import type { MapWorld } from "./mapGenerator";
import { MAP_PRESETS, getMapPreset } from "./mapConfig";
import { NATIONS } from "./types";
import { REGION_NAMES, placeRegionCentres } from "./regions";
import type { MapCell } from "./types";
import { createWrap, hex, wrappedDistance, wrappedNeighbors } from "./hex";
import type { Hex, MapWrap } from "./hex";

/**
 * The regions of a generated map (#239), checked as properties of
 * `generateMapFor` over many seeds and every size.
 */

const SEED_COUNT = 24;
const REQUESTS: MapRequest[] = MAP_PRESETS.flatMap((preset) =>
  Array.from({ length: SEED_COUNT }, (_, i) => ({ mapSize: preset.id, mapSeed: 1000 + i * 7919 }))
);
/** Each request's map, generated once for the whole suite. */
const maps = new Map<MapRequest, MapWorld>();
const generated = (request: MapRequest): MapWorld => {
  if (!maps.has(request)) maps.set(request, generateMapFor(request));
  return maps.get(request)!;
};

const wrapOf = ({ mapSize }: MapRequest) => createWrap(getMapPreset(mapSize).columns);
const hexKey = (h: Hex) => `${h.q},${h.r}`;
const ports = (cells: MapCell[]) => cells.filter((c) => c.hasPort);
/** The canonical hexes within `radius` steps of `centre`, round the seam. */
function hexesWithin(centre: Hex, radius: number, wrap: MapWrap): Hex[] {
  const seen = new Map([[hexKey(centre), centre]]);
  let ring = [centre];
  for (let step = 0; step < radius; step++) {
    ring = ring.flatMap((h) => wrappedNeighbors(h, wrap)).filter((h) => !seen.has(hexKey(h)));
    for (const h of ring) seen.set(hexKey(h), h);
  }
  return [...seen.values()];
}

const label = ({ mapSize, mapSeed }: MapRequest) => `${mapSize} seed ${mapSeed}`;

// Generating the maps takes a few seconds, and CI runners are slower still.
describe("generateMapFor: regions (#239)", { timeout: 60_000 }, () => {
  beforeAll(() => {
    for (const request of REQUESTS) generated(request);
  }, 120_000);

  it("cuts every map into five regions, one per nation plus the Pirates", () => {
    for (const request of REQUESTS) {
      const { regions } = generated(request);
      expect(regions.map((r) => r.nation), label(request)).toEqual([...NATIONS, "Pirate"]);
      expect(regions.map((r) => r.id), label(request)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("gives every region ports: two, three or four per nation by map size, and the one pirate haven", () => {
    const perNation = { small: 2, medium: 3, large: 4 };
    for (const request of REQUESTS) {
      const { cells } = generated(request);
      const counts = [0, 1, 2, 3, 4].map((id) => cells.filter((c) => c.hasPort && c.region === id).length);
      const n = perNation[request.mapSize];
      expect(counts, label(request)).toEqual([n, n, n, n, 1]);
    }
  });

  it("flies each region's flag over every port in it", () => {
    for (const request of REQUESTS) {
      const { cells, regions } = generated(request);
      for (const port of ports(cells)) {
        expect(port.nation, `${label(request)}: ${port.portName}`).toBe(regions[port.region!].nation);
      }
    }
  });

  it("puts the one pirate haven, with its shipyard, in the pirate region", () => {
    for (const request of REQUESTS) {
      const { cells, regions } = generated(request);
      const havens = ports(cells).filter((c) => c.nation === "Pirate");
      expect(havens, label(request)).toHaveLength(1);
      expect(regions[havens[0].region!].nation, label(request)).toBe("Pirate");
      expect(havens[0].hasShipyard, label(request)).toBe(true);
    }
  });

  it("names a region on every cell, water and land alike", () => {
    for (const request of REQUESTS) {
      const { cells } = generated(request);
      const without = cells.filter((c) => c.region === undefined || !Number.isInteger(c.region) || c.region < 0 || c.region > 4);
      expect(without.map((c) => hexKey(c.hex)), label(request)).toEqual([]);
    }
  });

  it("keeps a channel of open sea at least 3 hexes wide between the land of different regions, round the seam", () => {
    for (const request of REQUESTS) {
      const wrap = wrapOf(request);
      const { cells } = generated(request);
      const byKey = new Map(cells.map((c) => [hexKey(c.hex), c]));
      for (const land of cells.filter((c) => c.terrain === "island")) {
        // Three water hexes between them: no other region's land within three steps.
        for (const near of hexesWithin(land.hex, 3, wrap)) {
          const cell = byKey.get(hexKey(near));
          if (cell?.terrain !== "island") continue;
          expect(cell.region, `${label(request)}: ${hexKey(land.hex)} and ${hexKey(near)}`).toBe(land.region);
        }
      }
    }
  });

  it("gives every water hex the region of its nearest land", () => {
    for (const request of REQUESTS.filter((_, i) => i % 4 === 0)) {
      const wrap = wrapOf(request);
      const { cells } = generated(request);
      const land = cells.filter((c) => c.terrain === "island");
      for (const cell of cells) {
        if (cell.terrain === "island") continue;
        const nearest = Math.min(...land.map((l) => wrappedDistance(cell.hex, l.hex, wrap)));
        const nearestRegions = land.filter((l) => wrappedDistance(cell.hex, l.hex, wrap) === nearest).map((l) => l.region);
        expect(nearestRegions, `${label(request)}: ${hexKey(cell.hex)}`).toContain(cell.region);
      }
    }
  });

  it("lists as neighbours exactly the regions whose hexes touch, both ways", () => {
    for (const request of REQUESTS) {
      const wrap = wrapOf(request);
      const { cells, regions } = generated(request);
      const byKey = new Map(cells.map((c) => [hexKey(c.hex), c]));
      const touching = regions.map(() => new Set<number>());
      for (const cell of cells) {
        for (const n of wrappedNeighbors(cell.hex, wrap)) {
          const other = byKey.get(hexKey(n));
          if (other && other.region !== cell.region) touching[cell.region!].add(other.region!);
        }
      }
      for (const region of regions) {
        expect(region.neighbours, label(request)).toEqual([...touching[region.id]].sort((a, b) => a - b));
        for (const n of region.neighbours) expect(regions[n].neighbours, label(request)).toContain(region.id);
      }
      // Five regions on a cylinder: every region borders at least one other.
      for (const region of regions) expect(region.neighbours.length, label(request)).toBeGreaterThan(0);
    }
  });

  it("names each region from its nation's list", () => {
    for (const request of REQUESTS) {
      for (const region of generated(request).regions) {
        expect(REGION_NAMES[region.nation], label(request)).toContain(region.name);
      }
    }
  });

  it("gives the same regions for the same seed, and lays them out differently for different seeds", () => {
    for (const preset of MAP_PRESETS) {
      const a = generateMapFor({ mapSize: preset.id, mapSeed: 5 });
      const b = generateMapFor({ mapSize: preset.id, mapSeed: 5 });
      expect(a).toEqual(b);
      const layouts = new Set(
        [5, 6, 7, 8].map((mapSeed) => generateMapFor({ mapSize: preset.id, mapSeed }).cells.map((c) => c.region).join(""))
      );
      expect(layouts.size).toBe(4);
    }
  });
});

describe("placeRegionCentres (#239)", () => {
  it("never places two centres on the same hex, even when every draw repeats", () => {
    const candidates = [hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0), hex(4, 0)];
    // An rng stuck on one value draws the same candidate every time.
    const centres = placeRegionCentres(candidates, 5, () => 0, null);
    const keys = centres.map((h) => `${h.q},${h.r}`);
    expect(new Set(keys).size).toBe(5);
  });
});
