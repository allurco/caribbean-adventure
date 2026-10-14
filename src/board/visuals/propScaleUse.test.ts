/**
 * Every placement module draws at its family's factor (ADR 0006): props at
 * `PROP_SCALE`, buildings at `BUILDING_SCALE`, landmarks at
 * `LANDMARK_SCALE`, piers, quays and the town's clutter at
 * `TOWN_PIECE_SCALE`, the town's palms at `VEGETATION_SCALE`, ships at
 * `SHIP_SCALE`, with their footprints, clearances and margins, and the
 * derived props placed `PROP_DENSITY` times as densely. The authored sizes
 * are spelled out here so a module that drops its factor fails.
 */
import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap } from "../../game/hex";
import { BUILDING_SCALE, LANDMARK_SCALE, METRES_PER_UNIT, PROP_DENSITY, PROP_SCALE, SHIP_SCALE, TOWN_PIECE_SCALE, VEGETATION_SCALE } from "./worldScale";
import { HULL_FOAM_NOISE_SCALE } from "./hullFoam";
import { PIER_LAND_OVERLAP } from "./pierPlacement";
import { ROCK_SINK } from "./rockPlacement";
import { ROCK_MAX_EXTENT } from "./rockVariation";
import { BOULDER_SAMPLES_PER_EDGE, BOULDER_SCALE_RANGE, MIN_BOULDER_REACH } from "./shoreBoulders";
import {
  SHRUB_CLEARANCE,
  SHRUB_MAX_BURY,
  SHRUB_SCALE_RANGE,
  SHRUBS_PER_GRASS_CELL,
  SHRUBS_PER_SAND_CELL,
} from "./shrubPlacement";
import { STONE_SCALE_RANGE, STONES_PER_GRASS_CELL, STONES_PER_SAND_CELL } from "./smallStones";
import { QUAY_DEPTH_RANGE, QUAY_WIDTH_RANGE, quayAt, quayTopAt, portQuays } from "./quayPlacement";
import { QUAY_BASE, QUAY_COPING_THICKNESS, QUAY_STEP_Z, QUAY_TOP } from "./quayGeometry";
import { BUILDING_SINK, BUILDING_FOOTING_MARGIN, buildingGroundY, buildingMaxSpread, portBuildings, PORT_BUILDING_SCALE_RANGE, scaleRangeOf } from "./portSettlement";
import { PORT_HOVER_MARGIN, PORT_HOVER_RADIUS, PORT_MAX_BUILDING_HEIGHT, portHoverVolume } from "./portHover";
import { BUILDING_MAX_HEIGHT } from "./buildingGeometry";
import { decorationLayout } from "./decorationLayout";

import { sharedTerrainField } from "./sharedTerrainField";
import { landSurface } from "./landMesh";
import { SHIP_HULL_BOXES, SHIP_RIDE_HEIGHT, SHIP_SINK_DEPTH, shipHullBox } from "../shipHull";

const preset = getMapPreset("small");
const wrap = createWrap(preset.columns);
const cells = generateMap(preset, 1, wrap);
const seed = 1;

const scaled = (range: readonly [number, number], k: number) => [range[0] * k, range[1] * k];

describe("the derived props at the 350 m hex", () => {
  it("places stones, shrubs and shore boulders PROP_DENSITY times as densely", () => {
    expect(STONES_PER_SAND_CELL).toBe(PROP_DENSITY);
    expect(STONES_PER_GRASS_CELL).toBe(PROP_DENSITY);
    expect(SHRUBS_PER_GRASS_CELL).toEqual([PROP_DENSITY, 3 * PROP_DENSITY]);
    expect(SHRUBS_PER_SAND_CELL).toEqual([PROP_DENSITY, 3 * PROP_DENSITY]);
    expect(BOULDER_SAMPLES_PER_EDGE).toBe(3 * PROP_DENSITY);
  });

  it("draws them, their clearances and their margins at PROP_SCALE", () => {
    expect(STONE_SCALE_RANGE).toEqual(scaled([0.6, 1], PROP_SCALE));
    expect(SHRUB_SCALE_RANGE).toEqual(scaled([0.8, 1.3], PROP_SCALE));
    expect(SHRUB_CLEARANCE).toBe(0.05 * PROP_SCALE);
    expect(SHRUB_MAX_BURY).toBe(0.05 * PROP_SCALE);
    expect(BOULDER_SCALE_RANGE).toEqual(scaled([0.55, 1.2], PROP_SCALE));
    expect(MIN_BOULDER_REACH).toBe(0.06 * PROP_SCALE);
    expect(ROCK_SINK).toBe(0.02 * PROP_SCALE);
    expect(ROCK_MAX_EXTENT).toBe(0.85 * PROP_SCALE);
  });
});

describe("the generator's decorations at the 350 m hex", () => {
  const layout = decorationLayout(cells, wrap, seed);
  const decorations = cells.flatMap((c) => c.decorations ?? []);
  const authored = (type: string) => decorations.filter((d) => d.type === type).map((d) => d.scale ?? 1);

  it("draws palms and outcrops at PROP_SCALE, each with companions up to PROP_DENSITY per decoration", () => {
    for (const [type, placed] of [
      ["tree", layout.trees],
      ["rock", layout.rocks],
    ] as const) {
      const scales = authored(type);
      expect(placed.length).toBeGreaterThan(scales.length);
      expect(placed.length).toBeLessThanOrEqual(scales.length * PROP_DENSITY);
      const lo = Math.min(...scales) * PROP_SCALE * 0.8;
      const hi = Math.max(...scales) * PROP_SCALE * 1.2;
      for (const p of placed) {
        expect(p.scale).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(p.scale).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
  });

  it("draws piers at TOWN_PIECE_SCALE and starts them TOWN_PIECE_SCALE as far inland (#176)", () => {
    const pierScales = authored("pier").map((s) => s * TOWN_PIECE_SCALE);
    expect(layout.piers.length).toBeGreaterThan(0);
    for (const pier of layout.piers) expect(pierScales.some((s) => Math.abs(s - pier.scale) < 1e-12)).toBe(true);
    expect(PIER_LAND_OVERLAP).toBe(0.12 * TOWN_PIECE_SCALE);
  });

  it("draws the village at BUILDING_SCALE, its clutter at TOWN_PIECE_SCALE and its palms at VEGETATION_SCALE (#176)", () => {
    const { buildings, clutter } = layout.village;
    expect(buildings.length).toBeGreaterThan(0);
    for (const b of buildings) {
      expect(b.scale).toBeGreaterThanOrEqual(PORT_BUILDING_SCALE_RANGE[0] * BUILDING_SCALE - 1e-12);
      expect(b.scale).toBeLessThanOrEqual(PORT_BUILDING_SCALE_RANGE[1] * BUILDING_SCALE + 1e-12);
    }
    expect(clutter.some((c) => c.kind === "palm")).toBe(true);
    for (const c of clutter) expect(c.scale).toBe(c.kind === "palm" ? VEGETATION_SCALE : TOWN_PIECE_SCALE);
  });
});

describe("the port kit at the 350 m hex", () => {
  const drawn = landSurface(sharedTerrainField(cells, wrap, seed));

  it("draws every quay at TOWN_PIECE_SCALE across, along and up (#176)", () => {
    const quays = portQuays(cells, drawn, seed);
    expect(quays.length).toBeGreaterThan(0);
    const k = TOWN_PIECE_SCALE;
    for (const q of quays) {
      expect(q.scaleX).toBeGreaterThanOrEqual(QUAY_WIDTH_RANGE[0] * k - 1e-12);
      expect(q.scaleX).toBeLessThanOrEqual(QUAY_WIDTH_RANGE[1] * k + 1e-12);
      expect(q.scaleZ).toBeGreaterThanOrEqual(QUAY_DEPTH_RANGE[0] * k - 1e-12);
      expect(q.scaleZ).toBeLessThanOrEqual(QUAY_DEPTH_RANGE[1] * k + 1e-12);
      expect(q.top - q.worldY).toBeCloseTo(QUAY_TOP * k, 12);
    }
    // On deep ground the body reaches down its scaled base; the rear step is its scaled coping lower.
    const quay = quayAt({ sampleHeight: () => -1 }, { x: 0, z: 0 }, 0, { scaleX: k, scaleZ: k });
    expect(quay.worldY + QUAY_BASE * k).toBeCloseTo(-1, 12);
    const rear = quayTopAt(quay, { x: quay.worldX, z: quay.worldZ + (QUAY_STEP_Z - 0.01) * k });
    expect(rear).toBeCloseTo(quay.top - QUAY_COPING_THICKNESS * k, 12);
  });

  it("draws the watchtower (and so its flag) and the church at LANDMARK_SCALE, the rest of the kit at BUILDING_SCALE (#176)", () => {
    const buildings = portBuildings(cells, drawn, seed);
    expect(buildings.some((b) => b.kind === "watchtower")).toBe(true);
    expect(buildings.some((b) => b.kind === "church")).toBe(true);
    for (const b of buildings) {
      const [lo, hi] = scaleRangeOf(b.kind);
      const family = b.kind === "watchtower" || b.kind === "church" ? LANDMARK_SCALE : BUILDING_SCALE;
      expect(b.scale).toBeGreaterThanOrEqual(lo * family - 1e-12);
      expect(b.scale).toBeLessThanOrEqual(hi * family + 1e-12);
    }
  });

  it("sinks and spreads a building's footing by BUILDING_SCALE", () => {
    expect(buildingGroundY(1)).toBe(1 - BUILDING_SINK * BUILDING_SCALE);
    expect(buildingMaxSpread(0.1)).toBeCloseTo(0.1 - (BUILDING_SINK + BUILDING_FOOTING_MARGIN) * BUILDING_SCALE, 12);
  });

  it("sizes the port hover's height by the tallest building's family factor and its margin by BUILDING_SCALE, not its radius (#176)", () => {
    const volume = portHoverVolume({ x: 0, z: 0 }, 0, []);
    expect(PORT_MAX_BUILDING_HEIGHT).toBeGreaterThan(BUILDING_MAX_HEIGHT * BUILDING_SCALE);
    expect(volume.top).toBeCloseTo(PORT_MAX_BUILDING_HEIGHT + PORT_HOVER_MARGIN * BUILDING_SCALE, 12);
    expect(volume.bottom).toBeCloseTo(-PORT_HOVER_MARGIN * BUILDING_SCALE, 12);
    expect(volume.radius).toBe(PORT_HOVER_RADIUS);
  });
});

describe("the ships at diorama scale (ADR 0006)", () => {
  it("draws every hull at SHIP_SCALE, riding and sinking by it", () => {
    // Every class's box comes from its model at SHIP_SCALE (shipHull.test.ts), by its length overall.
    expect(SHIP_HULL_BOXES.Sloop[2]).toBeCloseTo((18 / 65) * SHIP_SCALE, 12);
    expect(SHIP_HULL_BOXES.Flute[2]).toBeCloseTo((30 / 65) * SHIP_SCALE, 12);
    expect(SHIP_HULL_BOXES.Frigate[2]).toBeCloseTo((38 / 65) * SHIP_SCALE, 12);
    expect(SHIP_HULL_BOXES.Galleon[2]).toBeCloseTo((42 / 65) * SHIP_SCALE, 12);
    expect(shipHullBox(undefined)).toEqual([0.3, 0.25, 0.7].map((v) => v * SHIP_SCALE));
    expect(shipHullBox("Galleon")).toBe(SHIP_HULL_BOXES.Galleon);
    expect(SHIP_RIDE_HEIGHT).toBe(0.12 * SHIP_SCALE);
    expect(SHIP_SINK_DEPTH).toBe(1.5 * SHIP_SCALE);
  });

  it("keeps the hull foam's lace its size in water metres, whatever the ship scale", () => {
    // Its size at the ship scale before ADR 0006 (2 × PROP_SCALE): 14 cycles per unit there.
    expect(METRES_PER_UNIT / HULL_FOAM_NOISE_SCALE).toBeCloseTo((METRES_PER_UNIT * 2 * PROP_SCALE) / 14, 12);
    expect(HULL_FOAM_NOISE_SCALE).not.toBeCloseTo(14 / SHIP_SCALE, 3);
  });
});
