/**
 * Every placement module draws at the 350 m hex (ADR 0003): props at
 * `PROP_SCALE`, buildings at `BUILDING_SCALE`, ships at `SHIP_SCALE`, with
 * their footprints, clearances and margins, and the derived props placed
 * `PROP_DENSITY` times as densely. The authored sizes are spelled out here
 * so a module that drops its factor fails.
 */
import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap } from "../../game/hex";
import { BUILDING_SCALE, PROP_DENSITY, PROP_SCALE, SHIP_SCALE } from "./worldScale";
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
import { BUILDING_SINK, BUILDING_FOOTING_MARGIN, buildingGroundY, buildingMaxSpread, portBuildings, scaleRangeOf } from "./portSettlement";
import { PORT_HOVER_MARGIN, PORT_HOVER_RADIUS, portHoverVolume } from "./portHover";
import { BUILDING_MAX_HEIGHT } from "./buildingGeometry";
import { decorationLayout } from "./decorationLayout";
import { terrainSeedFromCells } from "./terrainHeightField";
import { sharedTerrainField } from "./sharedTerrainField";
import { landSurface } from "./landMesh";
import { SHIP_HULL_BOXES, SHIP_RIDE_HEIGHT, SHIP_SINK_DEPTH, shipHullBox } from "../shipHull";

const preset = getMapPreset("small");
const wrap = createWrap(preset.columns);
const cells = generateMap(preset, 1, wrap);
const seed = terrainSeedFromCells(cells);

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
  const layout = decorationLayout(cells, wrap);
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

  it("draws piers at PROP_SCALE and starts them PROP_SCALE as far inland", () => {
    const pierScales = authored("pier").map((s) => s * PROP_SCALE);
    for (const pier of layout.piers) expect(pierScales.some((s) => Math.abs(s - pier.scale) < 1e-12)).toBe(true);
    expect(PIER_LAND_OVERLAP).toBe(0.12 * PROP_SCALE);
  });
});

describe("the port kit at the 350 m hex", () => {
  const drawn = landSurface(sharedTerrainField(cells, wrap));

  it("draws every quay at PROP_SCALE across, along and up", () => {
    const quays = portQuays(cells, drawn, seed);
    expect(quays.length).toBeGreaterThan(0);
    for (const q of quays) {
      expect(q.scaleX).toBeGreaterThanOrEqual(QUAY_WIDTH_RANGE[0] * PROP_SCALE - 1e-12);
      expect(q.scaleX).toBeLessThanOrEqual(QUAY_WIDTH_RANGE[1] * PROP_SCALE + 1e-12);
      expect(q.scaleZ).toBeGreaterThanOrEqual(QUAY_DEPTH_RANGE[0] * PROP_SCALE - 1e-12);
      expect(q.scaleZ).toBeLessThanOrEqual(QUAY_DEPTH_RANGE[1] * PROP_SCALE + 1e-12);
      expect(q.top - q.worldY).toBeCloseTo(QUAY_TOP * PROP_SCALE, 12);
    }
    // On deep ground the body reaches down its scaled base; the rear step is its scaled coping lower.
    const quay = quayAt({ sampleHeight: () => -1 }, { x: 0, z: 0 }, 0, { scaleX: PROP_SCALE, scaleZ: PROP_SCALE });
    expect(quay.worldY + QUAY_BASE * PROP_SCALE).toBeCloseTo(-1, 12);
    const rear = quayTopAt(quay, { x: quay.worldX, z: quay.worldZ + (QUAY_STEP_Z - 0.01) * PROP_SCALE });
    expect(rear).toBeCloseTo(quay.top - QUAY_COPING_THICKNESS * PROP_SCALE, 12);
  });

  it("draws every building (and so the tower's flag) at BUILDING_SCALE", () => {
    const buildings = portBuildings(cells, drawn, seed);
    expect(buildings.some((b) => b.kind === "watchtower")).toBe(true);
    for (const b of buildings) {
      const [lo, hi] = scaleRangeOf(b.kind);
      expect(b.scale).toBeGreaterThanOrEqual(lo * BUILDING_SCALE - 1e-12);
      expect(b.scale).toBeLessThanOrEqual(hi * BUILDING_SCALE + 1e-12);
    }
  });

  it("sinks and spreads a building's footing by BUILDING_SCALE", () => {
    expect(buildingGroundY(1)).toBe(1 - BUILDING_SINK * BUILDING_SCALE);
    expect(buildingMaxSpread(0.1)).toBeCloseTo(0.1 - (BUILDING_SINK + BUILDING_FOOTING_MARGIN) * BUILDING_SCALE, 12);
  });

  it("sizes the port hover's height and margin by BUILDING_SCALE, not its radius", () => {
    const volume = portHoverVolume({ x: 0, z: 0 }, 0, []);
    expect(volume.top).toBeCloseTo((BUILDING_MAX_HEIGHT + PORT_HOVER_MARGIN) * BUILDING_SCALE, 12);
    expect(volume.bottom).toBeCloseTo(-PORT_HOVER_MARGIN * BUILDING_SCALE, 12);
    expect(volume.radius).toBe(PORT_HOVER_RADIUS);
  });
});

describe("the ships at the 350 m hex", () => {
  it("draws every hull at SHIP_SCALE, riding and sinking by it", () => {
    expect(SHIP_HULL_BOXES.Galleon).toEqual([0.5, 0.35, 0.8].map((v) => v * SHIP_SCALE));
    expect(SHIP_HULL_BOXES.Sloop).toEqual([0.25, 0.2, 0.65].map((v) => v * SHIP_SCALE));
    expect(SHIP_HULL_BOXES.Flute).toEqual([0.4, 0.3, 0.6].map((v) => v * SHIP_SCALE));
    expect(SHIP_HULL_BOXES.Frigate).toEqual([0.35, 0.28, 0.7].map((v) => v * SHIP_SCALE));
    expect(shipHullBox(undefined)).toEqual([0.3, 0.25, 0.7].map((v) => v * SHIP_SCALE));
    expect(shipHullBox("Galleon")).toBe(SHIP_HULL_BOXES.Galleon);
    expect(SHIP_RIDE_HEIGHT).toBe(0.12 * SHIP_SCALE);
    expect(SHIP_SINK_DEPTH).toBe(1.5 * SHIP_SCALE);
  });

  it("keeps the hull foam's breakup the same size against the smaller hull", () => {
    expect(HULL_FOAM_NOISE_SCALE).toBe(14 / SHIP_SCALE);
  });
});
