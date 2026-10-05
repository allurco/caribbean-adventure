import { describe, it, expect } from "vitest";
import { generateMap, OPEN_SEA_EDGE_ROWS } from "./mapGenerator";
import {
  canonicalHex,
  createWrap,
  hexDistance,
  hexToOffset,
  neighbors,
  wrappedDistance,
  wrappedNeighbors,
} from "./hex";
import type { Hex, MapWrap } from "./hex";
import { MAP_PRESETS, getMapPreset } from "./mapConfig";
import type { MapDimensions } from "./mapConfig";
import type { MapCell } from "./types";
import { GOOD_TYPES, NATIONS, PORT_NATIONS } from "./types";

/** A small map that still fits a few islands between the open-sea edges. */
const TEST_MAP: MapDimensions = { columns: 12, rows: 12 };
const SMALL = getMapPreset("small");
const MEDIUM = getMapPreset("medium");
const LARGE = getMapPreset("large");
const SEEDS = [1, 7, 42, 123, 456, 789, 999, 2024];

const hexKey = (h: Hex) => `${h.q},${h.r}`;

/** Connected island groups, flood-filled over the map's (possibly wrapped) adjacency. */
function findIslands(map: MapCell[], wrap: MapWrap = null): Hex[][] {
  const islandHexes = map.filter((c) => c.terrain === "island").map((c) => c.hex);
  const islandSet = new Set(islandHexes.map(hexKey));
  const visited = new Set<string>();
  const islands: Hex[][] = [];
  for (const start of islandHexes) {
    if (visited.has(hexKey(start))) continue;
    const island: Hex[] = [];
    const queue: Hex[] = [start];
    visited.add(hexKey(start));
    while (queue.length > 0) {
      const current = queue.shift()!;
      island.push(current);
      for (const n of wrappedNeighbors(current, wrap)) {
        const k = hexKey(n);
        if (islandSet.has(k) && !visited.has(k)) {
          visited.add(k);
          queue.push(n);
        }
      }
    }
    islands.push(island);
  }
  return islands;
}

describe("generateMap: the rectangle", () => {
  it.each(MAP_PRESETS)("covers every column and offset row of the $id preset exactly once", (preset) => {
    const map = generateMap(preset, 42);
    expect(map).toHaveLength(preset.columns * preset.rows);
    const seen = new Set<string>();
    for (const cell of map) {
      const { col, row } = hexToOffset(cell.hex);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(preset.columns);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(preset.rows);
      const key = `${col},${row}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("stores every cell canonically", () => {
    const wrap = createWrap(SMALL.columns);
    for (const cell of generateMap(SMALL, 42, wrap)) {
      expect(canonicalHex(cell.hex, wrap)).toEqual(cell.hex);
    }
  });

  it("rejects an odd number of columns, which cannot wrap", () => {
    expect(() => generateMap({ columns: 13, rows: 12 }, 1)).toThrow();
  });

  it("rejects a wrap whose width is not the map's", () => {
    expect(() => generateMap(SMALL, 1, createWrap(SMALL.columns + 2))).toThrow();
  });

  it("lines its rows up across the seam: wrapping east off the last column lands where stepping east from any odd column would", () => {
    const wrap = createWrap(SMALL.columns);
    const map = generateMap(SMALL, 42, wrap);
    const keys = new Set(map.map((c) => hexKey(c.hex)));
    const lastColumn = map.filter((c) => hexToOffset(c.hex).col === SMALL.columns - 1);
    const interiorOdd = map.filter((c) => hexToOffset(c.hex).col === 1);
    expect(lastColumn).toHaveLength(SMALL.rows);
    for (let i = 0; i < SMALL.rows; i++) {
      const seam = neighbors(lastColumn[i].hex).map((n) => canonicalHex(n, wrap));
      const inside = neighbors(interiorOdd[i].hex);
      seam.forEach((n, dir) => {
        const across = hexToOffset(n);
        const within = hexToOffset(inside[dir]);
        // Same row change, and the column steps over the seam the same way.
        expect(across.row - hexToOffset(lastColumn[i].hex).row).toBe(within.row - hexToOffset(interiorOdd[i].hex).row);
        expect((across.col - (SMALL.columns - 1) + SMALL.columns) % SMALL.columns).toBe(
          (within.col - 1 + SMALL.columns) % SMALL.columns
        );
        // And every in-range neighbour across the seam is a real cell.
        if (across.row >= 0 && across.row < SMALL.rows) expect(keys.has(hexKey(n))).toBe(true);
      });
    }
  });
});

describe("generateMap: north and south edges", () => {
  it.each(MAP_PRESETS)("keeps the $id preset's top and bottom rows open sea", (preset) => {
    for (const seed of SEEDS) {
      for (const wrap of [null, createWrap(preset.columns)]) {
        for (const cell of generateMap(preset, seed, wrap)) {
          const { row } = hexToOffset(cell.hex);
          const nearEdge = row < OPEN_SEA_EDGE_ROWS || row >= preset.rows - OPEN_SEA_EDGE_ROWS;
          if (nearEdge) {
            expect(cell.terrain).toBe("water");
            expect(cell.hasPort).toBe(false);
          }
        }
      }
    }
  });

  it("keeps the edge row and the two rows next to it open", () => {
    expect(OPEN_SEA_EDGE_ROWS).toBe(3);
  });
});

describe("generateMap: across the seam", () => {
  const wrapOf = (dims: MapDimensions) => createWrap(dims.columns);

  it("grows islands across the seam on some maps", () => {
    const straddles = SEEDS.some((seed) => {
      const wrap = wrapOf(MEDIUM);
      return findIslands(generateMap(MEDIUM, seed, wrap), wrap).some((island) => {
        const cols = island.map((h) => hexToOffset(h).col);
        return cols.includes(0) && cols.includes(MEDIUM.columns - 1);
      });
    });
    expect(straddles).toBe(true);
  });

  it.each([SMALL, MEDIUM, LARGE])("keeps islands $columns×$rows of 3–10 hexes and 3 apart, measured round the seam", (dims) => {
    const wrap = wrapOf(dims);
    for (const seed of SEEDS) {
      const islands = findIslands(generateMap(dims, seed, wrap), wrap);
      for (const island of islands) {
        expect(island.length).toBeGreaterThanOrEqual(3);
        expect(island.length).toBeLessThanOrEqual(10);
      }
      for (let i = 0; i < islands.length; i++) {
        for (let j = i + 1; j < islands.length; j++) {
          let minDist = Infinity;
          for (const a of islands[i]) for (const b of islands[j]) minDist = Math.min(minDist, wrappedDistance(a, b, wrap));
          expect(minDist).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("gives each island (straddling ones too) at most one port", () => {
    const wrap = wrapOf(MEDIUM);
    for (const seed of SEEDS) {
      const map = generateMap(MEDIUM, seed, wrap);
      const ports = new Set(map.filter((c) => c.hasPort).map((c) => hexKey(c.hex)));
      for (const island of findIslands(map, wrap)) {
        expect(island.filter((h) => ports.has(hexKey(h))).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("docks every port at a water hex next to it, round the seam", () => {
    const wrap = wrapOf(MEDIUM);
    for (const seed of SEEDS) {
      const map = generateMap(MEDIUM, seed, wrap);
      const byKey = new Map(map.map((c) => [hexKey(c.hex), c]));
      for (const port of map.filter((c) => c.hasPort)) {
        expect(port.dockingHex).toBeDefined();
        expect(wrappedDistance(port.hex, port.dockingHex!, wrap)).toBe(1);
        expect(byKey.get(hexKey(port.dockingHex!))?.terrain).toBe("water");
      }
    }
  });

  it("only puts reefs next to islands, round the seam", () => {
    const wrap = wrapOf(MEDIUM);
    for (const seed of SEEDS) {
      const map = generateMap(MEDIUM, seed, wrap);
      const islands = new Set(map.filter((c) => c.terrain === "island").map((c) => hexKey(c.hex)));
      for (const reef of map.filter((c) => c.terrain === "reef")) {
        expect(wrappedNeighbors(reef.hex, wrap).some((n) => islands.has(hexKey(n)))).toBe(true);
      }
    }
  });

  it("shapes a straddling island like any other: one peak, ringed by jungle even across the seam", () => {
    const wrap = wrapOf(MEDIUM);
    for (const seed of SEEDS) {
      const map = generateMap(MEDIUM, seed, wrap);
      const byKey = new Map(map.map((c) => [hexKey(c.hex), c]));
      for (const island of findIslands(map, wrap)) {
        if (island.length < 5) continue;
        const peaks = island.filter((h) => byKey.get(hexKey(h))!.elevation === 3);
        expect(peaks).toHaveLength(1);
        for (const n of wrappedNeighbors(peaks[0], wrap)) {
          const cell = byKey.get(hexKey(n));
          if (cell?.terrain === "island" && !cell.hasPort) expect(cell.elevation).toBe(2);
        }
      }
    }
  });

  it("is deterministic by seed with the wrap", () => {
    const wrap = wrapOf(SMALL);
    expect(generateMap(SMALL, 42, wrap)).toEqual(generateMap(SMALL, 42, wrap));
  });

  it("keeps islands off the east and west edges' far side when the map does not wrap", () => {
    for (const seed of SEEDS) {
      const islands = findIslands(generateMap(MEDIUM, seed, null), null);
      for (const island of islands) {
        expect(island.length).toBeGreaterThanOrEqual(3);
        expect(island.length).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe("generateMap", () => {
  it("every cell has a valid terrain type", () => {
    const map = generateMap(TEST_MAP);
    for (const cell of map) {
      expect(["water", "island", "reef"]).toContain(cell.terrain);
    }
  });

  it("contains at least one island", () => {
    // Run multiple times to guard against unlikely all-water rolls
    let hasIsland = false;
    for (let i = 0; i < 20; i++) {
      const map = generateMap(TEST_MAP);
      if (map.some((c) => c.terrain === "island")) {
        hasIsland = true;
        break;
      }
    }
    expect(hasIsland).toBe(true);
  });

  it("produces deterministic output given the same seed", () => {
    const a = generateMap(TEST_MAP, 42);
    const b = generateMap(TEST_MAP, 42);
    expect(a).toEqual(b);
  });

  it("produces different output for different seeds", () => {
    const a = generateMap(TEST_MAP, 1);
    const b = generateMap(TEST_MAP, 2);
    const same = a.every((cell, i) => cell.terrain === b[i].terrain);
    expect(same).toBe(false);
  });

  it("every cell has a boolean hasPort property", () => {
    const map = generateMap(TEST_MAP, 42);
    for (const cell of map) {
      expect(typeof cell.hasPort).toBe("boolean");
    }
  });

  it("hasPort is only true on island cells", () => {
    const map = generateMap(TEST_MAP, 42);
    for (const cell of map) {
      if (cell.hasPort) {
        expect(cell.terrain).toBe("island");
      }
    }
  });

  it("seeded generation produces at least one port", () => {
    const map = generateMap(TEST_MAP, 42);
    expect(map.some((c) => c.hasPort)).toBe(true);
  });

  it("caps ports at 5, 10 and 15 on the small, medium and large maps", () => {
    const caps = [5, 10, 15];
    MAP_PRESETS.forEach((preset, i) => {
      for (const seed of SEEDS.slice(0, 3)) {
        const portCount = generateMap(preset, seed).filter((c) => c.hasPort).length;
        expect(portCount).toBeLessThanOrEqual(caps[i]);
        expect(portCount).toBeGreaterThan(0);
      }
    });
  });
});

describe("port markets", () => {
  it("port cells have a market with prices for all 4 goods", () => {
    const map = generateMap(TEST_MAP, 42);
    const ports = map.filter((c) => c.hasPort);
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      expect(port.market).toBeDefined();
      for (const good of GOOD_TYPES) {
        expect(port.market!.prices[good]).toBeDefined();
        expect(port.market!.prices[good].buy).toBeGreaterThan(0);
        expect(port.market!.prices[good].sell).toBeGreaterThan(0);
      }
    }
  });

  it("non-port cells have no market", () => {
    const map = generateMap(TEST_MAP, 42);
    const nonPorts = map.filter((c) => !c.hasPort);
    for (const cell of nonPorts) {
      expect(cell.market).toBeUndefined();
    }
  });

  it("buy price is greater than sell price for every good at every port", () => {
    const map = generateMap(TEST_MAP, 42);
    const ports = map.filter((c) => c.hasPort);
    for (const port of ports) {
      for (const good of GOOD_TYPES) {
        expect(port.market!.prices[good].buy).toBeGreaterThan(port.market!.prices[good].sell);
      }
    }
  });
});

describe("port shipyards", () => {
  it("some ports have shipyards and some do not", () => {
    const map = generateMap(SMALL, 42);
    const ports = map.filter((c) => c.hasPort);
    const withShipyard = ports.filter((c) => c.hasShipyard);
    const withoutShipyard = ports.filter((c) => !c.hasShipyard);
    expect(withShipyard.length).toBeGreaterThan(0);
    expect(withoutShipyard.length).toBeGreaterThan(0);
  });

  it("non-port cells do not have hasShipyard set", () => {
    const map = generateMap(TEST_MAP, 42);
    const nonPorts = map.filter((c) => !c.hasPort);
    for (const cell of nonPorts) {
      expect(cell.hasShipyard).toBeFalsy();
    }
  });
});

describe("port nations", () => {
  it("every port cell has a nation from PORT_NATIONS", () => {
    const map = generateMap(TEST_MAP, 42);
    const ports = map.filter((c) => c.hasPort);
    for (const port of ports) {
      expect(port.nation).toBeDefined();
      expect(PORT_NATIONS).toContain(port.nation);
    }
  });

  it("non-port cells have no nation", () => {
    const map = generateMap(TEST_MAP, 42);
    const nonPorts = map.filter((c) => !c.hasPort);
    for (const cell of nonPorts) {
      expect(cell.nation).toBeUndefined();
    }
  });

  it("there is exactly one pirate port", () => {
    const map = generateMap(SMALL, 42);
    const piratePorts = map.filter((c) => c.hasPort && c.nation === "Pirate");
    expect(piratePorts).toHaveLength(1);
  });

  it("pirate ports always have a shipyard", () => {
    const map = generateMap(SMALL, 42);
    const piratePorts = map.filter((c) => c.hasPort && c.nation === "Pirate");
    for (const port of piratePorts) {
      expect(port.hasShipyard).toBe(true);
    }
  });

  it("non-pirate ports are distributed among regular nations", () => {
    const map = generateMap(SMALL, 42);
    const regularPorts = map.filter((c) => c.hasPort && c.nation !== "Pirate");
    for (const port of regularPorts) {
      expect(NATIONS).toContain(port.nation);
    }
  });
});

describe("island structure", () => {
  it("islands are at least 3 hexes apart from each other", () => {
    const islands = findIslands(generateMap(SMALL, 42));
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        let minDist = Infinity;
        for (const a of islands[i]) for (const b of islands[j]) minDist = Math.min(minDist, hexDistance(a, b));
        expect(minDist).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("islands with ports have at least 3 hexes", () => {
    const map = generateMap(SMALL, 42);
    const ports = new Set(map.filter((c) => c.hasPort).map((c) => hexKey(c.hex)));
    for (const island of findIslands(map)) {
      if (island.some((h) => ports.has(hexKey(h)))) expect(island.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("each island has at most one port", () => {
    const map = generateMap(SMALL, 42);
    const ports = new Set(map.filter((c) => c.hasPort).map((c) => hexKey(c.hex)));
    for (const island of findIslands(map)) {
      expect(island.filter((h) => ports.has(hexKey(h))).length).toBeLessThanOrEqual(1);
    }
  });

  it("islands have varying sizes between 3 and 10 hexes", () => {
    const sizes = findIslands(generateMap(SMALL, 42)).map((i) => i.length);
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(3);
      expect(size).toBeLessThanOrEqual(10);
    }
    expect(new Set(sizes).size).toBeGreaterThan(1);
  });
});

describe("guaranteed big islands", () => {
  const BIG_ISLAND_MIN_SIZE = 7;
  const countBigIslands = (map: MapCell[], wrap: MapWrap) =>
    findIslands(map, wrap).filter((i) => i.length >= BIG_ISLAND_MIN_SIZE).length;

  it.each([
    [SMALL, 1],
    [MEDIUM, 2],
    [LARGE, 3],
  ] as const)("the $id map has enough big islands (7+ hexes)", (preset, minimum) => {
    for (const seed of [42, 123, 456, 789, 999]) {
      for (const wrap of [null, createWrap(preset.columns)]) {
        expect(countBigIslands(generateMap(preset, seed, wrap), wrap)).toBeGreaterThanOrEqual(minimum);
      }
    }
  });

  it("big islands rise to a single mountain peak", () => {
    const map = generateMap(SMALL, 42);
    const bigIslands = findIslands(map).filter((i) => i.length >= BIG_ISLAND_MIN_SIZE);
    expect(bigIslands.length).toBeGreaterThan(0);
    const byKey = new Map(map.map((c) => [hexKey(c.hex), c]));
    for (const island of bigIslands) {
      expect(island.filter((h) => byKey.get(hexKey(h))!.elevation === 3)).toHaveLength(1);
    }
  });
});
