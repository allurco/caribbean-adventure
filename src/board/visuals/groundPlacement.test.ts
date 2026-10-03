import { describe, it, expect } from "vitest";
import { hexToWorld } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import {
  placeOnGround,
  groundTopY,
  MIN_GROUND_HEIGHT,
  type GroundField,
  type GroundPlacementOptions,
} from "./groundPlacement";

const flat = (height: number): GroundField => ({ sampleHeight: () => height });
const tilted = (height: number, slopeX: number): GroundField => ({
  sampleHeight: (x) => height + slopeX * x,
});

const OPTIONS: GroundPlacementOptions = { footprintRadius: 0.1, sink: 0.02, maxSlope: 1 };

describe("placeOnGround", () => {
  it("sits on flat ground, sunk by `sink`", () => {
    const spot = placeOnGround(flat(0.5), { x: 1, z: 2 }, { x: 0, z: 0 }, OPTIONS);
    expect(spot).toEqual({ x: 1, y: 0.5 - 0.02, z: 2 });
  });

  it("rests on the lowest ground under its footprint on a gentle slope", () => {
    const spot = placeOnGround(tilted(0.5, 0.5), { x: 0, z: 0 }, { x: 0, z: 0 }, OPTIONS);
    expect(spot).not.toBeNull();
    expect(spot!.y).toBeCloseTo(0.5 - 0.5 * 0.1 - 0.02);
  });

  it("drops a spot whose ground is too steep everywhere", () => {
    expect(placeOnGround(tilted(5, 3), { x: 0.3, z: 0 }, { x: 0, z: 0 }, OPTIONS)).toBeNull();
  });

  it("drops a spot under or at sea level everywhere", () => {
    expect(placeOnGround(flat(-0.2), { x: 0.3, z: 0 }, { x: 0, z: 0 }, OPTIONS)).toBeNull();
    expect(placeOnGround(flat(MIN_GROUND_HEIGHT / 2), { x: 0.3, z: 0 }, { x: 0, z: 0 }, OPTIONS)).toBeNull();
  });

  it("nudges towards the anchor when the spot is in the water", () => {
    // Land only for x < 0.2; the anchor (cell centre) is on land.
    const field: GroundField = { sampleHeight: (x) => (x < 0.2 ? 0.4 : -0.3) };
    const spot = placeOnGround(field, { x: 0.6, z: 0 }, { x: 0, z: 0 }, OPTIONS);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeLessThan(0.2 - OPTIONS.footprintRadius);
    expect(spot!.y).toBeCloseTo(0.4 - 0.02);
  });

  it("nudges towards the anchor when the spot is on a cliff", () => {
    // Flat plateau near the anchor, steep drop beyond x = 0.3.
    const field: GroundField = { sampleHeight: (x) => (x < 0.3 ? 0.8 : 0.8 - 4 * (x - 0.3)) };
    const spot = placeOnGround(field, { x: 0.45, z: 0 }, { x: 0, z: 0 }, OPTIONS);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeLessThan(0.3);
  });
});

describe("groundTopY", () => {
  it("is the highest ground under the footprint, so nothing is buried", () => {
    expect(groundTopY(tilted(0.5, 0.5), 0, 0, 0.2)).toBeCloseTo(0.6);
  });

  it("never goes below sea level", () => {
    expect(groundTopY(flat(-0.4), 0, 0, 0.2)).toBe(0);
  });
});

describe("placement on a generated map's height field", () => {
  const cells = generateMap(12, 7);
  const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));

  it("puts every placed decoration on land, never floating above the ground beneath it", () => {
    let placed = 0;
    let requested = 0;
    for (const cell of cells) {
      const [cx, , cz] = hexToWorld(cell.hex);
      for (const deco of cell.decorations ?? []) {
        if (deco.type !== "tree" && deco.type !== "rock") continue;
        requested++;
        const x = cx + deco.position[0];
        const z = cz + deco.position[2];
        const spot = placeOnGround(field, { x, z }, { x: cx, z: cz }, OPTIONS);
        if (!spot) continue;
        placed++;
        expect(field.sampleHeight(spot.x, spot.z)).toBeGreaterThan(MIN_GROUND_HEIGHT);
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ground = field.sampleHeight(spot.x + dx * OPTIONS.footprintRadius, spot.z + dz * OPTIONS.footprintRadius);
          expect(spot.y).toBeLessThanOrEqual(ground);
        }
      }
    }
    // Nudging should rescue nearly all of them; dropping is the rare fallback.
    expect(placed).toBeGreaterThanOrEqual(requested * 0.95);
  });

  it("puts port tops at or above the ground at each port", () => {
    const ports = cells.filter((c) => c.hasPort);
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      const [x, , z] = hexToWorld(port.hex);
      expect(groundTopY(field, x, z, 0.35)).toBeGreaterThanOrEqual(Math.max(0, field.sampleHeight(x, z)));
    }
  });
});
