import { describe, it, expect } from "vitest";
import { generateMap } from "./mapGenerator";
import { hexGrid, hexEquals } from "./hex";
import { MAP_PRESETS } from "./mapConfig";
import { GOOD_TYPES, NATIONS } from "./types";

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

describe("port nations", () => {
  it("every port cell has a nation", () => {
    const map = generateMap(RADIUS, 42);
    const ports = map.filter((c) => c.hasPort);
    for (const port of ports) {
      expect(port.nation).toBeDefined();
      expect(NATIONS).toContain(port.nation);
    }
  });

  it("non-port cells have no nation", () => {
    const map = generateMap(RADIUS, 42);
    const nonPorts = map.filter((c) => !c.hasPort);
    for (const cell of nonPorts) {
      expect(cell.nation).toBeUndefined();
    }
  });

  it("nations are distributed round-robin across ports", () => {
    const map = generateMap(5, 42);
    const ports = map.filter((c) => c.hasPort);
    // With enough ports, nations should repeat in order
    for (let i = 0; i < ports.length; i++) {
      expect(ports[i].nation).toBe(NATIONS[i % NATIONS.length]);
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
