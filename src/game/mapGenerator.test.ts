import { describe, it, expect } from "vitest";
import { generateMap } from "./mapGenerator";
import { hexGrid, hexEquals, hexDistance, neighbors } from "./hex";
import type { Hex } from "./hex";
import { MAP_PRESETS } from "./mapConfig";
import { GOOD_TYPES, NATIONS, PORT_NATIONS } from "./types";

const RADIUS = 3;

describe("generateMap", () => {
  it("returns one MapCell per hex in the grid", () => {
    const grid = hexGrid(RADIUS);
    const map = generateMap(RADIUS);
    expect(map).toHaveLength(grid.length);
  });

  it("every cell has a valid terrain type", () => {
    const map = generateMap(RADIUS);
    for (const cell of map) {
      expect(["water", "island"]).toContain(cell.terrain);
    }
  });

  it("contains no duplicate hex positions", () => {
    const map = generateMap(RADIUS);
    const seen = new Set<string>();
    for (const cell of map) {
      const key = `${cell.hex.q},${cell.hex.r}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("covers every hex in the grid", () => {
    const grid = hexGrid(RADIUS);
    const map = generateMap(RADIUS);
    for (const h of grid) {
      expect(map.some((cell) => hexEquals(cell.hex, h))).toBe(true);
    }
  });

  it("center hex (0,0) is always water", () => {
    const map = generateMap(RADIUS);
    const center = map.find((c) => c.hex.q === 0 && c.hex.r === 0);
    expect(center).toBeDefined();
    expect(center!.terrain).toBe("water");
  });

  it("contains at least one island", () => {
    // Run multiple times to guard against unlikely all-water rolls
    let hasIsland = false;
    for (let i = 0; i < 20; i++) {
      const map = generateMap(RADIUS);
      if (map.some((c) => c.terrain === "island")) {
        hasIsland = true;
        break;
      }
    }
    expect(hasIsland).toBe(true);
  });

  it("produces deterministic output given the same seed", () => {
    const a = generateMap(RADIUS, 42);
    const b = generateMap(RADIUS, 42);
    expect(a).toEqual(b);
  });

  it("produces different output for different seeds", () => {
    const a = generateMap(RADIUS, 1);
    const b = generateMap(RADIUS, 2);
    const same = a.every(
      (cell, i) => cell.terrain === b[i].terrain
    );
    expect(same).toBe(false);
  });

  it("every cell has a boolean hasPort property", () => {
    const map = generateMap(RADIUS, 42);
    for (const cell of map) {
      expect(typeof cell.hasPort).toBe("boolean");
    }
  });

  it("hasPort is only true on island cells", () => {
    const map = generateMap(RADIUS, 42);
    for (const cell of map) {
      if (cell.hasPort) {
        expect(cell.terrain).toBe("island");
      }
    }
  });

  it("center cell (0,0) does not have a port", () => {
    const map = generateMap(RADIUS, 42);
    const center = map.find((c) => c.hex.q === 0 && c.hex.r === 0);
    expect(center).toBeDefined();
    expect(center!.hasPort).toBe(false);
  });

  it("seeded generation produces at least one port", () => {
    const map = generateMap(RADIUS, 42);
    expect(map.some((c) => c.hasPort)).toBe(true);
  });
});

describe("port markets", () => {
  it("port cells have a market with prices for all 4 goods", () => {
    const map = generateMap(RADIUS, 42);
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
    const map = generateMap(RADIUS, 42);
    const nonPorts = map.filter((c) => !c.hasPort);
    for (const cell of nonPorts) {
      expect(cell.market).toBeUndefined();
    }
  });

  it("buy price is greater than sell price for every good at every port", () => {
    const map = generateMap(RADIUS, 42);
    const ports = map.filter((c) => c.hasPort);
    for (const port of ports) {
      for (const good of GOOD_TYPES) {
        expect(port.market!.prices[good].buy).toBeGreaterThan(
          port.market!.prices[good].sell,
        );
      }
    }
  });

  it("seeded generation with markets is still deterministic", () => {
    const a = generateMap(RADIUS, 42);
    const b = generateMap(RADIUS, 42);
    expect(a).toEqual(b);
  });
});

describe("port shipyards", () => {
  it("some ports have shipyards and some do not", () => {
    // Use a large enough map to get statistical variety
    const map = generateMap(5, 42);
    const ports = map.filter((c) => c.hasPort);
    const withShipyard = ports.filter((c) => c.hasShipyard);
    const withoutShipyard = ports.filter((c) => !c.hasShipyard);
    expect(withShipyard.length).toBeGreaterThan(0);
    expect(withoutShipyard.length).toBeGreaterThan(0);
  });

  it("non-port cells do not have hasShipyard set", () => {
    const map = generateMap(RADIUS, 42);
    const nonPorts = map.filter((c) => !c.hasPort);
    for (const cell of nonPorts) {
      expect(cell.hasShipyard).toBeFalsy();
    }
  });
});

describe("port nations", () => {
  it("every port cell has a nation from PORT_NATIONS", () => {
    const map = generateMap(RADIUS, 42);
    const ports = map.filter((c) => c.hasPort);
    for (const port of ports) {
      expect(port.nation).toBeDefined();
      expect(PORT_NATIONS).toContain(port.nation);
    }
  });

  it("non-port cells have no nation", () => {
    const map = generateMap(RADIUS, 42);
    const nonPorts = map.filter((c) => !c.hasPort);
    for (const cell of nonPorts) {
      expect(cell.nation).toBeUndefined();
    }
  });

  it("there is exactly one pirate port", () => {
    const map = generateMap(5, 42);
    const ports = map.filter((c) => c.hasPort);
    const piratePorts = ports.filter((p) => p.nation === "Pirate");
    expect(piratePorts).toHaveLength(1);
  });

  it("pirate ports always have a shipyard", () => {
    const map = generateMap(5, 42);
    const piratePorts = map.filter((c) => c.hasPort && c.nation === "Pirate");
    for (const port of piratePorts) {
      expect(port.hasShipyard).toBe(true);
    }
  });

  it("non-pirate ports are distributed among regular nations", () => {
    const map = generateMap(5, 42);
    const ports = map.filter((c) => c.hasPort);
    const regularPorts = ports.filter((p) => p.nation !== "Pirate");
    // All regular ports should have a nation from NATIONS (not Pirate)
    for (const port of regularPorts) {
      expect(NATIONS).toContain(port.nation);
    }
  });
});

describe.each(MAP_PRESETS)("generateMap at $id preset (radius=$radius)", ({ radius }) => {
  it("returns one MapCell per hex in the grid", () => {
    const grid = hexGrid(radius);
    const map = generateMap(radius, 42);
    expect(map).toHaveLength(grid.length);
  });

  it("contains no duplicate hex positions", () => {
    const map = generateMap(radius, 42);
    const seen = new Set<string>();
    for (const cell of map) {
      const key = `${cell.hex.q},${cell.hex.r}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("center hex (0,0) is always water", () => {
    const map = generateMap(radius, 42);
    const center = map.find((c) => c.hex.q === 0 && c.hex.r === 0);
    expect(center).toBeDefined();
    expect(center!.terrain).toBe("water");
  });

  it("covers every hex in the grid", () => {
    const grid = hexGrid(radius);
    const map = generateMap(radius, 42);
    for (const h of grid) {
      expect(map.some((cell) => hexEquals(cell.hex, h))).toBe(true);
    }
  });
});

describe("island structure", () => {
  /** Helper to find connected island groups using flood fill */
  function findIslands(map: ReturnType<typeof generateMap>): Hex[][] {
    const islandHexes = map.filter((c) => c.terrain === "island").map((c) => c.hex);
    const hexKey = (h: Hex) => `${h.q},${h.r}`;
    const islandSet = new Set(islandHexes.map(hexKey));
    const visited = new Set<string>();
    const islands: Hex[][] = [];

    for (const hex of islandHexes) {
      const key = hexKey(hex);
      if (visited.has(key)) continue;

      // Flood fill to find connected island hexes
      const island: Hex[] = [];
      const queue: Hex[] = [hex];
      visited.add(key);

      while (queue.length > 0) {
        const current = queue.shift()!;
        island.push(current);

        for (const neighbor of neighbors(current)) {
          const nKey = hexKey(neighbor);
          if (islandSet.has(nKey) && !visited.has(nKey)) {
            visited.add(nKey);
            queue.push(neighbor);
          }
        }
      }

      islands.push(island);
    }

    return islands;
  }

  it("islands are at least 3 hexes apart from each other", () => {
    const map = generateMap(12, 42);
    const islands = findIslands(map);

    // Check distance between every pair of islands
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        // Find minimum distance between any hex in island i and any hex in island j
        let minDist = Infinity;
        for (const a of islands[i]) {
          for (const b of islands[j]) {
            minDist = Math.min(minDist, hexDistance(a, b));
          }
        }
        expect(minDist).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("islands with ports have at least 3 hexes", () => {
    const map = generateMap(12, 42);
    const islands = findIslands(map);
    const hexKey = (h: Hex) => `${h.q},${h.r}`;

    for (const island of islands) {
      const islandHexSet = new Set(island.map(hexKey));
      const portCells = map.filter(
        (c) => c.hasPort && islandHexSet.has(hexKey(c.hex))
      );

      if (portCells.length > 0) {
        expect(island.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("each island has at most one port", () => {
    const map = generateMap(12, 42);
    const islands = findIslands(map);
    const hexKey = (h: Hex) => `${h.q},${h.r}`;

    for (const island of islands) {
      const islandHexSet = new Set(island.map(hexKey));
      const portCount = map.filter(
        (c) => c.hasPort && islandHexSet.has(hexKey(c.hex))
      ).length;

      expect(portCount).toBeLessThanOrEqual(1);
    }
  });

  it("islands have varying sizes between 3 and 10 hexes", () => {
    const map = generateMap(12, 42);
    const islands = findIslands(map);
    const sizes = islands.map((i) => i.length);

    // All islands should be at least 3 hexes
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(3);
      expect(size).toBeLessThanOrEqual(10);
    }

    // With a large enough map, we should have some variety
    const uniqueSizes = new Set(sizes);
    expect(uniqueSizes.size).toBeGreaterThan(1);
  });

  it("islands are connected (no isolated single-hex islands)", () => {
    const map = generateMap(12, 42);
    const islands = findIslands(map);

    // Each island should be a connected group - verified by flood fill
    // This test ensures we don't have disconnected island hexes counted as one
    for (const island of islands) {
      expect(island.length).toBeGreaterThanOrEqual(3);
    }
  });
});
