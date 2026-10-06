import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import { groundTopY, MIN_GROUND_HEIGHT, type GroundField } from "./groundPlacement";
import { PORT_MARKER_RADIUS } from "../useHexGrid";
import {
  BUILDING_FOOTING,
  BUILDING_HALF_DIAGONAL,
  BUILDING_HEIGHT,
  BUILDING_MAX_BURY,
  BUILDING_MAX_HEIGHT,
} from "./buildingGeometry";
import {
  portBuildings,
  PORT_BUILDING_CLEARANCE,
  PORT_BUILDING_GAP,
  PORT_BUILDING_SCALE_RANGE,
  PORT_BUILDING_SLOT_ANGLES,
  PORT_BUILDING_TINT_SPREAD,
  PORT_BUILDING_YAW_JITTER,
  WATCHTOWER_SCALE_RANGE,
  type PortBuilding,
} from "./portBuildings";

const cells = generateMap(getMapPreset("small"), 11);
const seed = terrainSeedFromCells(cells);
const field = createTerrainHeightField(cells, seed);
const buildings = portBuildings(cells, field, seed);
const ports = cells.filter((c) => c.hasPort);

const flat = (height: number): GroundField => ({ sampleHeight: () => height });

/** The port cell a building belongs to: the nearest port centre. */
function portOf(b: PortBuilding): MapCell {
  let best = ports[0];
  let bestD = Infinity;
  for (const p of ports) {
    const [x, , z] = hexToWorld(p.hex);
    const d = Math.hypot(x - b.worldX, z - b.worldZ);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

const pierRotation = (cell: MapCell) => (cell.decorations ?? []).find((d) => d.type === "pier")?.rotation ?? 0;
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe("portBuildings", () => {
  it("names its layout constants: four slots on the landward arc, small scale and tint spreads", () => {
    expect(PORT_BUILDING_SLOT_ANGLES).toHaveLength(4);
    for (const a of PORT_BUILDING_SLOT_ANGLES) expect(Math.abs(a)).toBeLessThan(Math.PI / 2);
    expect(PORT_BUILDING_CLEARANCE).toBeGreaterThan(0);
    expect(PORT_BUILDING_SCALE_RANGE[0]).toBeGreaterThanOrEqual(0.9);
    expect(PORT_BUILDING_SCALE_RANGE[1]).toBeLessThanOrEqual(1.1);
    expect(PORT_BUILDING_TINT_SPREAD).toBeLessThanOrEqual(0.1);
    expect(PORT_BUILDING_YAW_JITTER).toBeLessThanOrEqual(0.2);
    // The watchtower never breaks the height cap at its largest scale.
    expect(BUILDING_HEIGHT.watchtower * WATCHTOWER_SCALE_RANGE[1]).toBeLessThanOrEqual(BUILDING_MAX_HEIGHT);
  });

  it("is deterministic", () => {
    expect(portBuildings(cells, field, seed)).toEqual(buildings);
  });

  it("hashes the whole 32-bit seed: a seed differing only in a high bit gives a different layout", () => {
    for (const bit of [20, 25, 30, 31]) {
      const other = portBuildings(cells, field, seed ^ (1 << bit));
      expect(other.length).toBeGreaterThan(0);
      expect(other.map((b) => b.tint)).not.toEqual(buildings.map((b) => b.tint));
    }
  });

  it("gives every port a watchtower and up to three other buildings, four to five instances at most", () => {
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      const mine = buildings.filter((b) => portOf(b) === port);
      expect(mine.length).toBeGreaterThanOrEqual(1);
      expect(mine.length).toBeLessThanOrEqual(5);
      expect(mine.filter((b) => b.kind === "watchtower")).toHaveLength(1);
      // The other kinds appear at most once each.
      const kinds = mine.map((b) => b.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
    // Most slots are filled; a cramped beach with water on three sides drops a building or two.
    expect(buildings.length).toBeGreaterThanOrEqual(ports.length * 2.5);
  });

  it("puts no building on a cell without a port, and no watchtower on a port without a fort", () => {
    const noForts = cells.map((c) =>
      c.hasPort ? { ...c, decorations: (c.decorations ?? []).filter((d) => d.type !== "fort") } : c
    );
    const towers = portBuildings(noForts, field, seed).filter((b) => b.kind === "watchtower");
    expect(towers).toHaveLength(0);
    const noPorts = cells.map((c) => ({ ...c, hasPort: false }));
    expect(portBuildings(noPorts, flat(0.3), seed)).toEqual([]);
  });

  it("keeps every building clear of the port marker's hover volume, inside the hex and off its neighbours", () => {
    for (const b of buildings) {
      const [px, , pz] = hexToWorld(portOf(b).hex);
      const d = Math.hypot(b.worldX - px, b.worldZ - pz);
      const reach = BUILDING_HALF_DIAGONAL[b.kind] * b.scale;
      expect(d - reach).toBeGreaterThanOrEqual(PORT_MARKER_RADIUS + PORT_BUILDING_CLEARANCE - 1e-9);
      expect(d + reach).toBeLessThan(1);
      for (const other of buildings) {
        if (other === b) continue;
        const gap = Math.hypot(other.worldX - b.worldX, other.worldZ - b.worldZ) - reach - BUILDING_HALF_DIAGONAL[other.kind] * other.scale;
        expect(gap).toBeGreaterThanOrEqual(PORT_BUILDING_GAP - 1e-9);
      }
    }
  });

  it("stands every building on the ground, on land", () => {
    for (const b of buildings) {
      const ground = field.sampleHeight(b.worldX, b.worldZ);
      expect(ground).toBeGreaterThan(MIN_GROUND_HEIGHT);
      // Everywhere under the footprint the ground lies between the bottom of the
      // footing (so no wall floats) and the deepest allowed bury on the high side.
      const reach = BUILDING_HALF_DIAGONAL[b.kind] * b.scale;
      const heights = [ground];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        heights.push(field.sampleHeight(b.worldX + Math.cos(a) * reach, b.worldZ + Math.sin(a) * reach));
      }
      for (const h of heights) {
        expect(h).toBeGreaterThanOrEqual(b.worldY - BUILDING_FOOTING - 1e-9);
        expect(h).toBeLessThanOrEqual(b.worldY + BUILDING_MAX_BURY + 1e-9);
      }
      // And it does rest on the ground: the lowest probe is within the footing of the origin.
      expect(b.worldY - Math.min(...heights)).toBeLessThanOrEqual(BUILDING_FOOTING);
    }
  });

  it("keeps every roof under the port label's baseline", () => {
    for (const b of buildings) {
      const [px, , pz] = hexToWorld(portOf(b).hex);
      const labelBase = groundTopY(field, px, pz, PORT_MARKER_RADIUS) + 0.6;
      expect(b.worldY + BUILDING_HEIGHT[b.kind] * b.scale).toBeLessThan(labelBase);
      expect(BUILDING_HEIGHT[b.kind] * b.scale).toBeLessThanOrEqual(BUILDING_MAX_HEIGHT);
    }
  });

  it("places the buildings behind the pier, on the landward half, facing the water", () => {
    for (const b of buildings) {
      const port = portOf(b);
      const [px, , pz] = hexToWorld(port.hex);
      const toWater = pierRotation(port);
      const toBuilding = Math.atan2(b.worldX - px, b.worldZ - pz);
      // More than a right angle away from the docking direction.
      expect(angleDiff(toBuilding, toWater)).toBeGreaterThan(Math.PI / 2);
      expect(angleDiff(b.yaw, toWater)).toBeLessThanOrEqual(PORT_BUILDING_YAW_JITTER + 1e-9);
    }
  });

  it("varies scale and tint within their spreads", () => {
    for (const b of buildings) {
      const range = b.kind === "watchtower" ? WATCHTOWER_SCALE_RANGE : PORT_BUILDING_SCALE_RANGE;
      expect(b.scale).toBeGreaterThanOrEqual(range[0]);
      expect(b.scale).toBeLessThanOrEqual(range[1]);
      expect(Math.abs(b.tint - 1)).toBeLessThanOrEqual(PORT_BUILDING_TINT_SPREAD);
    }
    expect(new Set(buildings.map((b) => b.tint.toFixed(4))).size).toBeGreaterThan(buildings.length / 2);
  });
});
