import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap, hexToWorld, type MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import { MIN_GROUND_HEIGHT, type GroundField } from "./groundPlacement";
import { smallStones } from "./smallStones";
import { PORT_MARKER_RADIUS } from "../useHexGrid";
import { SHRUB_FOOTPRINT_RADIUS } from "./shrubGeometry";
import type { DecorationData } from "./useDecorationLayout";
import {
  placeShrubs,
  shrubObstacles,
  segmentDistance,
  SHRUB_ATTEMPTS,
  SHRUB_CLEARANCE,
  SHRUB_GROUND_FOOTPRINT,
  SHRUB_KIND_BY_BIOME,
  SHRUB_MAX_BURY,
  SHRUB_PORT_CLEARANCE,
  SHRUB_SCALE_RANGE,
  SHRUB_SPREAD,
  SHRUB_TREE_RADIUS,
  SHRUBS_PER_GRASS_CELL,
  SHRUBS_PER_SAND_CELL,
  type PlacedProps,
} from "./shrubPlacement";

const TAU = Math.PI * 2;

/** The generator's props at their raw spots (no ground nudge), plus the derived stones. */
function placedPropsOf(cells: readonly MapCell[], field: GroundField, seed: number): PlacedProps {
  const placed = { trees: [] as DecorationData[], rocks: [] as DecorationData[], piers: [] as DecorationData[] };
  for (const cell of cells) {
    const [hexX, , hexZ] = hexToWorld(cell.hex);
    for (const deco of cell.decorations ?? []) {
      const data: DecorationData = {
        type: deco.type,
        worldX: hexX + deco.position[0],
        worldY: 0.3,
        worldZ: hexZ + deco.position[2],
        rotation: deco.rotation,
        scale: deco.scale ?? 1,
        biome: cell.biome,
      };
      if (deco.type === "tree") placed.trees.push(data);
      else if (deco.type === "rock") placed.rocks.push(data);
      else if (deco.type === "pier") placed.piers.push(data);
    }
  }
  return { ...placed, stones: smallStones(cells, field, seed) };
}

function layoutOf(size: "small" | "medium" | "large", mapSeed: number, wrap: MapWrap = null) {
  const cells = generateMap(getMapPreset(size), mapSeed, wrap);
  const seed = terrainSeedFromCells(cells);
  const field = createTerrainHeightField(cells, seed, { wrap });
  const placed = placedPropsOf(cells, field, seed);
  return { cells, seed, field, placed, shrubs: placeShrubs(cells, field, seed, placed) };
}

const { cells, seed, field, placed, shrubs } = layoutOf("small", 11);

const flat = (height: number): GroundField => ({ sampleHeight: () => height });

const takesShrubs = (cell: MapCell) =>
  cell.terrain === "island" && (cell.biome === "SAND" || cell.biome === "GRASS");
const cellOf = (shrub: { worldX: number; worldZ: number }) =>
  cells.find((c) => {
    const [x, , z] = hexToWorld(c.hex);
    return Math.hypot(x - shrub.worldX, z - shrub.worldZ) <= SHRUB_SPREAD + 1e-6;
  });

const grassCell = (q: number, r: number, extra: Partial<MapCell> = {}): MapCell => ({
  hex: { q, r, s: -q - r },
  terrain: "island",
  hasPort: false,
  elevation: 2,
  biome: "GRASS",
  ...extra,
});

describe("placeShrubs", () => {
  it("places one to three clusters per grass cell and one to three tufts per sand cell", () => {
    expect(SHRUBS_PER_GRASS_CELL).toEqual([1, 3]);
    expect(SHRUBS_PER_SAND_CELL).toEqual([1, 3]);
    expect(SHRUB_KIND_BY_BIOME).toEqual({ GRASS: "bush", SAND: "tuft", ROCK: null });
  });

  it("is deterministic", () => {
    expect(placeShrubs(cells, field, seed, placed)).toEqual(shrubs);
  });

  it("changes with the seed", () => {
    const other = placeShrubs(cells, field, seed + 1, placed);
    expect(other.length).toBeGreaterThan(0);
    expect(other.map((s) => s.worldX)).not.toEqual(shrubs.map((s) => s.worldX));
  });

  it("hashes the whole 32-bit seed: a seed differing only in a high bit gives a different layout", () => {
    for (const bit of [20, 25, 30, 31]) {
      const other = placeShrubs(cells, field, seed ^ (1 << bit), placed);
      expect(other.length).toBeGreaterThan(0);
      expect(other.map((s) => s.worldX)).not.toEqual(shrubs.map((s) => s.worldX));
    }
  });

  it("covers the sand and grass cells: at least one shrub on most of them, never more than three", () => {
    const eligible = cells.filter(takesShrubs);
    expect(eligible.length).toBeGreaterThan(10);
    expect(shrubs.length).toBeGreaterThanOrEqual(eligible.length * 0.8);
    expect(shrubs.length).toBeLessThanOrEqual(eligible.length * 3);
    const perCell = new Map<MapCell, number>();
    for (const shrub of shrubs) {
      const cell = cellOf(shrub);
      expect(cell).toBeDefined();
      perCell.set(cell!, (perCell.get(cell!) ?? 0) + 1);
    }
    for (const count of perCell.values()) expect(count).toBeLessThanOrEqual(3);
    expect(perCell.size).toBeGreaterThanOrEqual(eligible.length * 0.6);
  });

  it("puts bushes on grass cells and tufts on sand cells, nothing on rock or water", () => {
    for (const shrub of shrubs) {
      const cell = cellOf(shrub);
      expect(cell).toBeDefined();
      expect(takesShrubs(cell!)).toBe(true);
      expect(shrub.kind).toBe(SHRUB_KIND_BY_BIOME[cell!.biome!]);
    }
  });

  it("stands every shrub on the ground: never floating, buried no deeper than its base probe allows", () => {
    // The probe is the stem/mound base, not the foliage, and placement rejects
    // any spot that would bury it below SHRUB_MAX_BURY at the shrub's centre
    // (ridged relief can dip further under one rim probe than the slope check
    // sees), so the bound is enforced, not hoped for.
    expect(SHRUB_GROUND_FOOTPRINT).toBeLessThanOrEqual(0.05);
    for (const shrub of shrubs) {
      const ground = field.sampleHeight(shrub.worldX, shrub.worldZ);
      expect(ground).toBeGreaterThan(MIN_GROUND_HEIGHT);
      expect(shrub.worldY).toBeLessThanOrEqual(ground);
      expect(shrub.worldY).toBeGreaterThanOrEqual(ground - SHRUB_MAX_BURY - 1e-9);
    }
  });

  it("scales and turns each shrub within the named ranges", () => {
    for (const shrub of shrubs) {
      expect(shrub.scale).toBeGreaterThanOrEqual(SHRUB_SCALE_RANGE[0]);
      expect(shrub.scale).toBeLessThanOrEqual(SHRUB_SCALE_RANGE[1]);
      expect(shrub.rotation).toBeGreaterThanOrEqual(0);
      expect(shrub.rotation).toBeLessThan(TAU);
    }
  });

  it("keeps clear of the cell's trees, rocks, stones and piers", () => {
    const obstacles = shrubObstacles(placed);
    expect(obstacles.length).toBeGreaterThan(0);
    for (const shrub of shrubs) {
      const radius = SHRUB_FOOTPRINT_RADIUS[shrub.kind] * shrub.scale;
      for (const o of obstacles) {
        const d = segmentDistance(shrub.worldX, shrub.worldZ, o);
        expect(d).toBeGreaterThanOrEqual(o.radius + radius + SHRUB_CLEARANCE - 1e-6);
      }
    }
  });

  it("keeps clear of other shrubs in the same cell", () => {
    for (let i = 0; i < shrubs.length; i++) {
      for (let j = i + 1; j < shrubs.length; j++) {
        const a = shrubs[i];
        const b = shrubs[j];
        const d = Math.hypot(a.worldX - b.worldX, a.worldZ - b.worldZ);
        const ra = SHRUB_FOOTPRINT_RADIUS[a.kind] * a.scale;
        const rb = SHRUB_FOOTPRINT_RADIUS[b.kind] * b.scale;
        expect(d).toBeGreaterThanOrEqual(ra + rb - 1e-6);
      }
    }
  });

  it("keeps clear of the port marker on port cells", () => {
    expect(SHRUB_PORT_CLEARANCE).toBeGreaterThanOrEqual(PORT_MARKER_RADIUS + 0.05);
    const ports = cells.filter((c) => c.hasPort);
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      const [x, , z] = hexToWorld(port.hex);
      for (const shrub of shrubs) {
        const d = Math.hypot(shrub.worldX - x, shrub.worldZ - z);
        if (d > SHRUB_SPREAD) continue;
        expect(d).toBeGreaterThanOrEqual(SHRUB_PORT_CLEARANCE + SHRUB_FOOTPRINT_RADIUS[shrub.kind] * shrub.scale - 1e-6);
      }
    }
  });

  it("keeps clear of a tree standing in the cell", () => {
    const cell = grassCell(0, 0, { decorations: [{ type: "tree", position: [0.2, 0, 0.1], rotation: 0, scale: 1 }] });
    const tree: DecorationData = { type: "tree", worldX: 0.2, worldY: 0.5, worldZ: 0.1, rotation: 0, scale: 1 };
    const props: PlacedProps = { trees: [tree], rocks: [], stones: [], piers: [] };
    let found = 0;
    for (let s = 0; s < 40; s++) {
      for (const shrub of placeShrubs([cell], flat(0.5), s, props)) {
        found++;
        const d = Math.hypot(shrub.worldX - 0.2, shrub.worldZ - 0.1);
        expect(d).toBeGreaterThanOrEqual(SHRUB_TREE_RADIUS + SHRUB_FOOTPRINT_RADIUS.bush * shrub.scale + SHRUB_CLEARANCE - 1e-6);
      }
    }
    expect(found).toBeGreaterThan(40);
  });

  it("keeps off the pier deck on a port cell: the plank from 0.4 to 1.0 units along its facing", () => {
    const cell = grassCell(0, 0, { hasPort: true, biome: "SAND" });
    const pier: DecorationData = { type: "pier", worldX: 0, worldY: 0, worldZ: 0, rotation: 0, scale: 1 };
    const props: PlacedProps = { trees: [], rocks: [], stones: [], piers: [pier] };
    const [deck] = shrubObstacles(props);
    // Facing 0 points along +z (sin 0, cos 0), as TerrainDecorations offsets the pier.
    expect(deck.ax).toBeCloseTo(0, 9);
    expect(deck.az).toBeCloseTo(0.4, 9);
    expect(deck.bz).toBeCloseTo(1.0, 9);
    for (let s = 0; s < 40; s++) {
      for (const shrub of placeShrubs([cell], flat(0.5), s, props)) {
        const d = segmentDistance(shrub.worldX, shrub.worldZ, deck);
        expect(d).toBeGreaterThanOrEqual(deck.radius + SHRUB_FOOTPRINT_RADIUS.tuft * shrub.scale + SHRUB_CLEARANCE - 1e-6);
      }
    }
  });

  it("retries a few spots per shrub so clearances thin the vegetation only a little", () => {
    expect(SHRUB_ATTEMPTS).toBeGreaterThanOrEqual(2);
    expect(SHRUB_ATTEMPTS).toBeLessThanOrEqual(5);
  });

  it("places nothing on a map with no sand or grass cells", () => {
    const rocky = cells.map((c) => (c.terrain === "island" ? { ...c, biome: "ROCK" as const } : c));
    expect(placeShrubs(rocky, flat(0.5), seed, placed)).toEqual([]);
  });

  it("places each shrub once from its canonical cell on a wrapping map", () => {
    const wrapped = layoutOf("small", 11, createWrap(24));
    expect(wrapped.shrubs.length).toBeGreaterThan(wrapped.cells.filter(takesShrubs).length * 0.8);
    const xs = wrapped.cells.filter(takesShrubs).map((c) => hexToWorld(c.hex)[0]);
    const [minX, maxX] = [Math.min(...xs) - SHRUB_SPREAD, Math.max(...xs) + SHRUB_SPREAD];
    for (const shrub of wrapped.shrubs) {
      expect(shrub.worldX).toBeGreaterThanOrEqual(minX - 1e-6);
      expect(shrub.worldX).toBeLessThanOrEqual(maxX + 1e-6);
    }
  });
});

describe("segmentDistance", () => {
  it("measures to the nearest point of the segment, or to the point when it degenerates", () => {
    const seg = { ax: 0, az: 0, bx: 2, bz: 0, radius: 0 };
    expect(segmentDistance(1, 1, seg)).toBeCloseTo(1, 9);
    expect(segmentDistance(3, 0, seg)).toBeCloseTo(1, 9);
    expect(segmentDistance(-1, 0, seg)).toBeCloseTo(1, 9);
    expect(segmentDistance(1, 1, { ax: 1, az: 0, bx: 1, bz: 0, radius: 0 })).toBeCloseTo(1, 9);
  });
});
