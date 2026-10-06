import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import { MIN_GROUND_HEIGHT, type GroundField } from "./groundPlacement";
import {
  smallStones,
  STONE_SCALE_RANGE,
  STONE_SPREAD,
  STONES_PER_GRASS_CELL,
  STONES_PER_SAND_CELL,
} from "./smallStones";

const cells = generateMap(getMapPreset("small"), 11);
const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
const seed = terrainSeedFromCells(cells);
const stones = smallStones(cells, field, seed);

const flat = (height: number): GroundField => ({ sampleHeight: () => height });

const hasRock = (cell: MapCell) => (cell.decorations ?? []).some((d) => d.type === "rock");
const takesStones = (cell: MapCell) =>
  cell.terrain === "island" && !cell.hasPort && !hasRock(cell) && (cell.biome === "SAND" || cell.biome === "GRASS");

describe("smallStones", () => {
  it("places one stone per sand or grass cell", () => {
    expect(STONES_PER_SAND_CELL).toBe(1);
    expect(STONES_PER_GRASS_CELL).toBe(1);
  });

  it("is deterministic", () => {
    expect(smallStones(cells, field, seed)).toEqual(stones);
  });

  it("changes with the seed", () => {
    const other = smallStones(cells, field, seed + 1);
    expect(other.length).toBeGreaterThan(0);
    expect(other.map((s) => s.worldX)).not.toEqual(stones.map((s) => s.worldX));
  });

  it("hashes the whole 32-bit seed: a seed differing only in a high bit gives a different layout", () => {
    // seedOf quantises its values by 4096 (a 12-bit shift into int32), which would
    // drop the seed's top 12 bits if the seed were passed as a value.
    for (const bit of [20, 25, 30, 31]) {
      const other = smallStones(cells, field, seed ^ (1 << bit));
      expect(other.length).toBeGreaterThan(0);
      expect(other.map((s) => s.worldX)).not.toEqual(stones.map((s) => s.worldX));
    }
  });

  it("puts a stone on nearly every sand or grass cell that has no rock and no port", () => {
    const eligible = cells.filter(takesStones);
    expect(eligible.length).toBeGreaterThan(5);
    // Nudging rescues nearly all; dropping (steep or wet ground) is the rare fallback.
    expect(stones.length).toBeGreaterThanOrEqual(eligible.length * 0.9);
    expect(stones.length).toBeLessThanOrEqual(eligible.length);
  });

  it("keeps stones off rock cells, port cells, water and cells that already have a rock", () => {
    const eligible = cells.filter(takesStones);
    for (const stone of stones) {
      const cell = eligible.find(
        (c) => Math.hypot(hexToWorld(c.hex)[0] - stone.worldX, hexToWorld(c.hex)[2] - stone.worldZ) <= STONE_SPREAD + 1e-6
      );
      expect(cell).toBeDefined();
    }
  });

  it("keeps each stone within its cell's spread and on the ground", () => {
    for (const stone of stones) {
      expect(field.sampleHeight(stone.worldX, stone.worldZ)).toBeGreaterThan(MIN_GROUND_HEIGHT);
      expect(stone.worldY).toBeLessThanOrEqual(field.sampleHeight(stone.worldX, stone.worldZ));
      expect(stone.worldY).toBeGreaterThan(MIN_GROUND_HEIGHT - 0.1);
    }
  });

  it("marks stones as small rocks with their cell's biome", () => {
    for (const stone of stones) {
      expect(stone.type).toBe("rock");
      expect(stone.scale).toBeGreaterThanOrEqual(STONE_SCALE_RANGE[0]);
      expect(stone.scale).toBeLessThanOrEqual(STONE_SCALE_RANGE[1]);
      expect(stone.biome === "SAND" || stone.biome === "GRASS").toBe(true);
      expect(stone.rotation).toBeGreaterThanOrEqual(0);
      expect(stone.rotation).toBeLessThan(Math.PI * 2);
    }
  });

  it("scales stones between 0.6 and 1 of a small rock: knee-to-waist high, not the [0.3, 0.5] pebbles", () => {
    expect(STONE_SCALE_RANGE[0]).toBeGreaterThanOrEqual(0.6);
    expect(STONE_SCALE_RANGE[1]).toBeLessThanOrEqual(1);
    expect(STONE_SCALE_RANGE[0]).toBeLessThan(STONE_SCALE_RANGE[1]);
  });

  it("places nothing on a map with no eligible cells", () => {
    const rocky = cells.map((c) => (c.terrain === "island" ? { ...c, biome: "ROCK" as const } : c));
    expect(smallStones(rocky, flat(0.5), seed)).toEqual([]);
  });
});
