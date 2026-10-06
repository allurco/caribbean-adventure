import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap, hexToWorld, wrapWorldWidth } from "../../game/hex";
import type { MapCell } from "../../game/types";
import type { GroundField } from "./groundPlacement";
import { PIER_DECK_TOP } from "./pierGeometry";
import { pierOrigin } from "./pierPlacement";
import {
  QUAY_BACK,
  QUAY_BASE,
  QUAY_COPING_THICKNESS,
  QUAY_SEA_FACE,
  QUAY_STEP_Z,
  QUAY_TOP,
  QUAY_TYPICAL_LIFT,
  QUAY_WATERLINE,
  QUAY_WIDTH,
} from "./quayGeometry";
import {
  placeQuay,
  portQuays,
  quayAt,
  quayTopY,
  QUAY_DEPTH_RANGE,
  QUAY_LIP,
  QUAY_MAX_STEP,
  QUAY_PROUD_OF_SAND,
  QUAY_WIDTH_RANGE,
  type QuayPlacement,
} from "./quayPlacement";
import { createTerrainHeightField, SEA_LEVEL, terrainSeedFromCells } from "./terrainHeightField";

const flat = (height: number): GroundField => ({ sampleHeight: () => height });
const centre = { x: 3, z: -2 };
const rotation = 0.7;
const port: MapCell = {
  hex: { q: 2, r: -1, s: -1 },
  terrain: "island",
  hasPort: true,
  elevation: 1,
  decorations: [{ type: "pier", position: [0, 0, 0], rotation }],
};
const seed = 0x1234abcd;

/** World (x, z) of a point given in the quay's local frame (unscaled). */
function worldPoint(q: QuayPlacement, x: number, z: number): { x: number; z: number } {
  const lx = x * q.scaleX;
  const lz = z * q.scaleZ;
  return {
    x: q.worldX + lx * Math.cos(q.yaw) + lz * Math.sin(q.yaw),
    z: q.worldZ - lx * Math.sin(q.yaw) + lz * Math.cos(q.yaw),
  };
}

/** Ground under the quay's plan: the corners, edge midpoints and centre of the body's footprint. */
function footprintHeights(field: GroundField, q: QuayPlacement): number[] {
  const hw = QUAY_WIDTH / 2;
  const heights: number[] = [];
  for (const x of [-hw, 0, hw]) for (const z of [QUAY_BACK, (QUAY_BACK + QUAY_SEA_FACE) / 2, QUAY_SEA_FACE]) {
    const p = worldPoint(q, x, z);
    heights.push(field.sampleHeight(p.x, p.z));
  }
  return heights;
}

describe("quayAt", () => {
  it("keeps the deck a lip above the pier deck and never more than a step, and the size spread within two to three piers", () => {
    expect(QUAY_LIP).toBeCloseTo(QUAY_TOP - PIER_DECK_TOP, 9);
    expect(QUAY_LIP).toBeGreaterThan(0);
    expect(QUAY_PROUD_OF_SAND).toBeGreaterThan(0.02);
    expect(QUAY_MAX_STEP).toBeGreaterThan(QUAY_LIP);
    expect(QUAY_MAX_STEP).toBeLessThanOrEqual(0.12);
    expect(QUAY_WIDTH * QUAY_WIDTH_RANGE[0]).toBeGreaterThanOrEqual(0.32);
    expect(QUAY_WIDTH * QUAY_WIDTH_RANGE[1]).toBeLessThanOrEqual(0.48);
    expect(QUAY_DEPTH_RANGE[0]).toBeGreaterThanOrEqual(0.8);
    expect(QUAY_DEPTH_RANGE[1]).toBeLessThanOrEqual(1.2);
  });

  it("stands at the pier's land end, turned with the pier, at sea level on a low beach", () => {
    const field = flat(SEA_LEVEL + 0.03);
    const q = quayAt(field, centre, rotation, { scaleX: 1, scaleZ: 1 });
    const origin = pierOrigin(field, centre, rotation);
    expect(q.worldX).toBeCloseTo(origin.x, 9);
    expect(q.worldZ).toBeCloseTo(origin.z, 9);
    expect(q.yaw).toBe(rotation);
    expect(q.worldY).toBeCloseTo(0, 9);
    expect(q.top).toBeCloseTo(PIER_DECK_TOP + QUAY_LIP, 9);
  });

  it("lifts the deck clear of a high beach at its sea face, up to the step cap", () => {
    const q = quayAt(flat(0.1), centre, rotation, { scaleX: 1, scaleZ: 1 });
    expect(q.top).toBeCloseTo(0.1 + QUAY_PROUD_OF_SAND, 9);
    expect(q.worldY).toBeCloseTo(q.top - QUAY_TOP, 9);
    const capped = quayAt(flat(0.4), centre, rotation, { scaleX: 1, scaleZ: 1 });
    expect(capped.top).toBeCloseTo(PIER_DECK_TOP + QUAY_MAX_STEP, 9);
  });

  it("never floats: where the ground falls away under a corner the whole quay is lowered onto it", () => {
    // A ledge: beach along the pier line, a deep drop to one side.
    const field: GroundField = {
      sampleHeight: (x) => (x > centre.x + 0.1 ? -0.6 : 0.05),
    };
    const q = quayAt(field, centre, 0, { scaleX: 1, scaleZ: 1 });
    const lowest = Math.min(...footprintHeights(field, q));
    expect(lowest).toBeLessThan(-0.5);
    expect(q.worldY + QUAY_BASE).toBeLessThanOrEqual(lowest + 1e-9);
    expect(q.top).toBeCloseTo(q.worldY + QUAY_TOP, 9);
  });

  it("is the same across the wrap seam: a copy one wrap width over gets the same height and size", () => {
    const { columns } = getMapPreset("small");
    const wrap = createWrap(columns);
    const width = wrapWorldWidth(wrap);
    const cells = generateMap(getMapPreset("small"), 11);
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells), { wrap });
    const ports = cells.filter((c) => c.hasPort);
    expect(ports.length).toBeGreaterThan(0);
    for (const cell of ports) {
      const pier = (cell.decorations ?? []).find((d) => d.type === "pier");
      if (!pier) continue;
      const [hx, , hz] = hexToWorld(cell.hex);
      const size = { scaleX: 0.95, scaleZ: 1.05 };
      const here = quayAt(field, { x: hx, z: hz }, pier.rotation, size);
      const there = quayAt(field, { x: hx + width, z: hz }, pier.rotation, size);
      expect(there.worldX - here.worldX).toBeCloseTo(width, 6);
      expect(there.worldZ).toBeCloseTo(here.worldZ, 6);
      expect(there.worldY).toBeCloseTo(here.worldY, 6);
      expect(there.top).toBeCloseTo(here.top, 6);
    }
  });
});

describe("placeQuay", () => {
  it("gives a port with a pier a quay sized from the cell and the whole seed, and none to a cell without a pier", () => {
    const field = flat(0.05);
    const q = placeQuay(port, field, seed);
    expect(q).not.toBeNull();
    expect(q!.scaleX).toBeGreaterThanOrEqual(QUAY_WIDTH_RANGE[0]);
    expect(q!.scaleX).toBeLessThanOrEqual(QUAY_WIDTH_RANGE[1]);
    expect(q!.scaleZ).toBeGreaterThanOrEqual(QUAY_DEPTH_RANGE[0]);
    expect(q!.scaleZ).toBeLessThanOrEqual(QUAY_DEPTH_RANGE[1]);
    expect(placeQuay(port, field, seed)).toEqual(q);
    for (const bit of [20, 25, 31]) {
      const other = placeQuay(port, field, seed ^ (1 << bit));
      expect([other!.scaleX, other!.scaleZ]).not.toEqual([q!.scaleX, q!.scaleZ]);
    }
    expect(placeQuay({ ...port, decorations: [] }, field, seed)).toBeNull();
    expect(placeQuay({ ...port, hasPort: false }, field, seed)).toBeNull();
  });

  it("on generated maps, every port's quay stands at its pier root, above the sand at its sea face and never floating", () => {
    for (const mapSeed of [11, 23, 47]) {
      const cells = generateMap(getMapPreset("small"), mapSeed);
      const terrainSeed = terrainSeedFromCells(cells);
      const field = createTerrainHeightField(cells, terrainSeed);
      const quays = portQuays(cells, field, terrainSeed);
      const ports = cells.filter((c) => c.hasPort);
      expect(quays).toHaveLength(ports.length);
      ports.forEach((cell, i) => {
        const q = quays[i];
        const pier = (cell.decorations ?? []).find((d) => d.type === "pier")!;
        const [hx, , hz] = hexToWorld(cell.hex);
        const origin = pierOrigin(field, { x: hx, z: hz }, pier.rotation);
        expect(q.worldX).toBeCloseTo(origin.x, 9);
        expect(q.worldZ).toBeCloseTo(origin.z, 9);
        expect(q.yaw).toBe(pier.rotation);
        expect(q.top).toBeGreaterThanOrEqual(PIER_DECK_TOP + QUAY_LIP - 1e-9);
        expect(q.top).toBeLessThanOrEqual(PIER_DECK_TOP + QUAY_MAX_STEP + 1e-9);
        const heights = footprintHeights(field, q);
        expect(q.worldY + QUAY_BASE).toBeLessThanOrEqual(Math.min(...heights) + 1e-9);
        // The sea face stands proud of the sand unless the step cap is reached.
        const hw = QUAY_WIDTH / 2;
        for (const x of [-hw, 0, hw]) {
          const p = worldPoint(q, x, QUAY_SEA_FACE);
          const sand = field.sampleHeight(p.x, p.z);
          if (q.top < PIER_DECK_TOP + QUAY_MAX_STEP - 1e-9) expect(sand).toBeLessThanOrEqual(q.top - QUAY_PROUD_OF_SAND + 1e-9);
        }
      });
    }
  });

  it("models the waterline where the typical lift lands it: at the sea on the median port, never above it by more than a block", () => {
    // The tide mark, the course line and the stair foot are baked into the
    // shared mesh at QUAY_WATERLINE, so they can only be right for one lift.
    const lifts: number[] = [];
    for (const mapSeed of [11, 23, 47, 61, 83]) {
      const cells = generateMap(getMapPreset("small"), mapSeed);
      const terrainSeed = terrainSeedFromCells(cells);
      const field = createTerrainHeightField(cells, terrainSeed);
      for (const q of portQuays(cells, field, terrainSeed)) lifts.push(q.worldY);
    }
    lifts.sort((a, b) => a - b);
    const median = lifts[Math.floor(lifts.length / 2)];
    expect(lifts.length).toBeGreaterThan(20);
    expect(Math.abs(median + QUAY_WATERLINE - SEA_LEVEL), `median lift ${median.toFixed(4)} of ${lifts.length}`).toBeLessThan(0.012);
    expect(QUAY_WATERLINE).toBeLessThan(SEA_LEVEL);
    expect(QUAY_TYPICAL_LIFT).toBeCloseTo(SEA_LEVEL - QUAY_WATERLINE, 9);
    // The highest lift the placement allows puts the mark no more than a block above the water.
    const cap = PIER_DECK_TOP + QUAY_MAX_STEP - QUAY_TOP;
    expect(cap + QUAY_WATERLINE - SEA_LEVEL).toBeLessThanOrEqual(0.03 + 1e-9);
    expect(lifts[lifts.length - 1]).toBeLessThanOrEqual(cap + 1e-9);
  });
});

describe("quayTopY", () => {
  const field = flat(0.05);
  const q = placeQuay(port, field, seed)!;

  it("gives the deck height over the deck, the step height over the rear step, and nothing beyond the quay or without a pier", () => {
    const hw = QUAY_WIDTH / 2;
    const onDeck = worldPoint(q, hw * 0.5, (QUAY_STEP_Z + QUAY_SEA_FACE) / 2);
    expect(quayTopY(port, field, seed, onDeck)).toBeCloseTo(q.top, 9);
    const onStep = worldPoint(q, -hw * 0.5, (QUAY_BACK + QUAY_STEP_Z) / 2);
    expect(quayTopY(port, field, seed, onStep)).toBeCloseTo(q.top - QUAY_COPING_THICKNESS, 9);
    const beside = worldPoint(q, hw * 1.2, 0);
    expect(quayTopY(port, field, seed, beside)).toBeUndefined();
    const behind = worldPoint(q, 0, QUAY_BACK - 0.05);
    expect(quayTopY(port, field, seed, behind)).toBeUndefined();
    const seaward = worldPoint(q, 0, QUAY_SEA_FACE + 0.05);
    expect(quayTopY(port, field, seed, seaward)).toBeUndefined();
    expect(quayTopY({ ...port, decorations: [] }, field, seed, onDeck)).toBeUndefined();
  });

  it("follows the per-port width: a point just inside a wide quay's edge is on it", () => {
    const edge = worldPoint(q, QUAY_WIDTH / 2 - 0.001, 0);
    expect(quayTopY(port, field, seed, edge)).toBeCloseTo(q.top, 9);
  });
});
