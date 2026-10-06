import { describe, it, expect } from "vitest";
import { hexToWorld } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import {
  placeOnGround,
  standOnGround,
  groundTopY,
  MIN_GROUND_HEIGHT,
  type GroundField,
  type GroundPlacementOptions,
} from "./groundPlacement";

const flat = (height: number): GroundField => ({ sampleHeight: () => height });
const tilted = (height: number, slopeX: number): GroundField => ({
  sampleHeight: (x) => height + slopeX * x,
});
/** A cone-shaped peak: `height` at the origin, falling `fall` per unit of distance. */
const peak = (height: number, fall: number): GroundField => ({
  sampleHeight: (x, z) => height - fall * Math.hypot(x, z),
});
/**
 * Flat ground at `height` with one round pit `depth` deep and 0.03 across,
 * centred at (px, pz): small enough to sit under a single rim probe.
 */
const pitted = (height: number, px: number, pz: number, depth: number): GroundField => ({
  sampleHeight: (x, z) => (Math.hypot(x - px, z - pz) < 0.03 ? height - depth : height),
});

const OPTIONS: GroundPlacementOptions = { footprintRadius: 0.1, sink: 0.02, maxSlope: 1 };

describe("placeOnGround", () => {
  it("sits on flat ground, sunk by `sink`", () => {
    const spot = placeOnGround(flat(0.5), { x: 1, z: 2 }, { x: 0, z: 0 }, OPTIONS);
    expect(spot).toEqual({ x: 1, y: 0.5 - 0.02, z: 2 });
  });

  it("rests on the lowest ground under its footprint on a gentle slope by default (a trunk must not float)", () => {
    const spot = placeOnGround(tilted(0.5, 0.5), { x: 0, z: 0 }, { x: 0, z: 0 }, OPTIONS);
    expect(spot).not.toBeNull();
    expect(spot!.y).toBeCloseTo(0.5 - 0.5 * 0.1 - 0.02);
    const explicit = placeOnGround(tilted(0.5, 0.5), { x: 0, z: 0 }, { x: 0, z: 0 }, { ...OPTIONS, standOn: "lowest" });
    expect(explicit).toEqual(spot);
  });

  it("stands on the ground at its centre when asked to, whatever the rim probes find", () => {
    const spot = placeOnGround(tilted(0.5, 0.5), { x: 0, z: 0 }, { x: 0, z: 0 }, { ...OPTIONS, standOn: "centre" });
    expect(spot).not.toBeNull();
    expect(spot!.y).toBeCloseTo(0.5 - 0.02);
  });

  it("keeps a wide footprint on a steep peak at the summit height when standing on the centre", () => {
    // The lowest rule sinks a 0.8-wide base by the whole fall to its rim; the centre rule does not.
    const wide = { footprintRadius: 0.8, sink: 0.02, maxSlope: 1.6 } as const;
    const lowest = placeOnGround(peak(1.4, 1.5), { x: 0, z: 0 }, { x: 0, z: 0 }, wide);
    const centre = placeOnGround(peak(1.4, 1.5), { x: 0, z: 0 }, { x: 0, z: 0 }, { ...wide, standOn: "centre" });
    expect(lowest!.y).toBeCloseTo(1.4 - 1.5 * 0.8 - 0.02);
    expect(centre!.y).toBeCloseTo(1.4 - 0.02);
  });

  it("still rejects water and cliffs under the rim when standing on the centre", () => {
    const wet = { sampleHeight: (x: number) => (x < 0.25 ? 0.4 : -0.3) };
    const spot = placeOnGround(wet, { x: 0.6, z: 0 }, { x: 0, z: 0 }, { ...OPTIONS, standOn: "centre" });
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeLessThan(0.25 - OPTIONS.footprintRadius);
    expect(placeOnGround(tilted(5, 3), { x: 0.3, z: 0 }, { x: 0, z: 0 }, { ...OPTIONS, standOn: "centre" })).toBeNull();
  });

  it("probes all round the rim: land under the cross probes but water under a diagonal nudges the spot", () => {
    // Land where x + z < 0.52. At (0.2, 0.2) with radius 0.1 the cross probes reach
    // x + z = 0.5 (land) but the (+x, +z) diagonal rim reaches 0.4 + 0.1·√2 ≈ 0.54 (water).
    const field: GroundField = { sampleHeight: (x, z) => (x + z < 0.52 ? 0.4 : -0.3) };
    const spot = placeOnGround(field, { x: 0.2, z: 0.2 }, { x: 0, z: 0 }, OPTIONS);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeLessThan(0.2);
  });

  it("probes the rim closely enough that a coastal inlet narrower than a hex cannot slip between two probes", () => {
    // Water in a wedge 0.3 units wide at a radius of 0.85 (the rock extent cap), between two probe directions.
    const field: GroundField = {
      sampleHeight: (x, z) => (Math.abs(Math.atan2(z, x) - 0.3) < 0.15 / 0.85 && Math.hypot(x, z) > 0.6 ? -0.3 : 0.4),
    };
    const wide = { footprintRadius: 0.85, sink: 0.02, maxSlope: 1.6, standOn: "centre" } as const;
    expect(placeOnGround(field, { x: 0, z: 0 }, { x: 0, z: 0 }, wide)).toBeNull();
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

  describe("maxBury", () => {
    // Flat ground at 0.5 with a pit under the 45° rim probe of a footprint at
    // (0.5, 0): the ±x/±z probes see level ground, so the slope check passes,
    // but the lowest rule would sink the base by the pit's depth plus the sink.
    const diagonal = Math.SQRT1_2 * OPTIONS.footprintRadius;
    const spot = { x: 0.5, z: 0 };
    const anchor = { x: 0, z: 0 };
    const bounded = { ...OPTIONS, maxBury: 0.05 };

    it("rejects a spot whose rim dips deeper under the centre than allowed, and nudges it to level ground", () => {
      const field = pitted(0.5, spot.x + diagonal, spot.z + diagonal, 0.08);
      expect(standOnGround(field, spot.x, spot.z, bounded)).toBeNull();
      const placed = placeOnGround(field, spot, anchor, bounded);
      expect(placed).not.toBeNull();
      expect(placed!.x).toBeLessThan(spot.x);
      expect(placed!.y).toBeCloseTo(0.5 - 0.02);
    });

    it("without a bound still rests on the lowest probe minus the sink", () => {
      const field = pitted(0.5, spot.x + diagonal, spot.z + diagonal, 0.08);
      const stood = standOnGround(field, spot.x, spot.z, OPTIONS);
      expect(stood).not.toBeNull();
      expect(stood!.y).toBeCloseTo(0.5 - 0.08 - 0.02);
      expect(placeOnGround(field, spot, anchor, OPTIONS)).toEqual(stood);
    });

    it("accepts a dip that keeps the base within the bound", () => {
      const field = pitted(0.5, spot.x + diagonal, spot.z + diagonal, 0.02);
      const stood = standOnGround(field, spot.x, spot.z, bounded);
      expect(stood).not.toBeNull();
      expect(stood!.y).toBeCloseTo(0.5 - 0.02 - 0.02);
      expect(placeOnGround(field, spot, anchor, bounded)).toEqual(stood);
    });

    it("counts the sink towards the bound: flat ground buries the base by the sink alone", () => {
      expect(standOnGround(flat(0.5), spot.x, spot.z, { ...OPTIONS, maxBury: 0.03 })).not.toBeNull();
      expect(standOnGround(flat(0.5), spot.x, spot.z, { ...OPTIONS, maxBury: 0.01 })).toBeNull();
    });
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
  const cells = generateMap(getMapPreset("small"), 7);
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
