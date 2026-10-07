import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap } from "../../game/hex";
import { createTerrainHeightField, terrainSeedFromCells, type TerrainHeightField } from "./terrainHeightField";
import {
  MAX_TERRACES,
  RISER,
  SHORE_KEEP_BOTTOM,
  SHORE_KEEP_TOP,
  plateauPlanDistance,
  shoreKeep,
  type TownPlateau,
} from "./townPlateau";

/** The #84 prop scale at a 350 m hex. */
const SCALE = 115 / 350;

function fields(seed: number): { plain: TerrainHeightField; town: TerrainHeightField } {
  const preset = getMapPreset("small");
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, seed, wrap);
  const terrainSeed = terrainSeedFromCells(cells);
  return {
    plain: createTerrainHeightField(cells, terrainSeed, { wrap }),
    town: createTerrainHeightField(cells, terrainSeed, { wrap, townPlateaus: { scale: SCALE } }),
  };
}

/** Points on a grid over each plateau's reach. */
function* aroundPlateaus(plateaus: readonly TownPlateau[], step: number): Generator<[number, number, TownPlateau]> {
  for (const p of plateaus) {
    for (let x = p.x - p.reach; x <= p.x + p.reach; x += step) {
      for (let z = p.z - p.reach; z <= p.z + p.reach; z += step) yield [x, z, p];
    }
  }
}

const SEEDS = [1, 2, 3];

describe("town plateaus (#84)", () => {
  it("are off by default: the field without the option builds none and matches one built with it unset", () => {
    const preset = getMapPreset("small");
    for (const seed of SEEDS) {
      const { plain, town } = fields(seed);
      expect(plain.townPlateaus).toEqual([]);
      const wrap = createWrap(preset.columns);
      const cells = generateMap(preset, seed, wrap);
      const unset = createTerrainHeightField(cells, terrainSeedFromCells(cells), { wrap, townPlateaus: undefined });
      for (const [x, z] of aroundPlateaus(town.townPlateaus ?? [], 0.05)) expect(unset.sampleHeight(x, z)).toBe(plain.sampleHeight(x, z));
    }
  });

  it("plans one plateau per port, one to three terraces stepping up by at most a riser", () => {
    for (const seed of SEEDS) {
      const { town } = fields(seed);
      const plateaus = town.townPlateaus ?? [];
      expect(plateaus.length).toBeGreaterThan(0);
      for (const p of plateaus) {
        expect(p.levels.length - 1).toBeGreaterThanOrEqual(1);
        expect(p.levels.length - 1).toBeLessThanOrEqual(MAX_TERRACES);
        expect(p.levels[0]).toBeGreaterThanOrEqual(SHORE_KEEP_TOP);
        for (let k = 1; k < p.levels.length; k++) {
          expect(p.levels[k]).toBeGreaterThanOrEqual(p.levels[k - 1]);
          expect(p.levels[k] - p.levels[k - 1]).toBeLessThanOrEqual(RISER * SCALE + 1e-12);
        }
      }
    }
  });

  it("is exactly flat on the square and each terrace, away from the ramps and the shore band", () => {
    for (const seed of SEEDS) {
      const { plain, town } = fields(seed);
      let checked = 0;
      for (const [x, z, p] of aroundPlateaus(town.townPlateaus ?? [], 0.02)) {
        if (plateauPlanDistance(p, x, z) > 0 || shoreKeep(plain.sampleHeight(x, z)) < 1) continue;
        const s = (x - p.x) * p.ux + (z - p.z) * p.uz;
        let level = -1;
        if (s < p.steps[0]) level = p.levels[0];
        for (let k = 0; k < p.steps.length; k++) {
          const next = k + 1 < p.steps.length ? p.steps[k + 1] : Infinity;
          if (s >= p.steps[k] + p.ramp && s < next) level = p.levels[k + 1];
        }
        if (level < 0) continue;
        // Only where no other plateau reaches.
        if ((town.townPlateaus ?? []).some((o) => o !== p && plateauPlanDistance(o, x, z) < o.blend)) continue;
        expect(town.sampleHeight(x, z)).toBeCloseTo(level, 12);
        checked++;
      }
      expect(checked).toBeGreaterThan(50);
    }
  });

  it("blends into the untouched terrain without a step", () => {
    for (const seed of SEEDS) {
      const { town } = fields(seed);
      for (const p of town.townPlateaus ?? []) {
        // Rays from the centre out past the blend, in 0.004 steps.
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          let prev = town.sampleHeight(p.x, p.z);
          for (let r = 0.004; r <= p.reach; r += 0.004) {
            const h = town.sampleHeight(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r);
            expect(Math.abs(h - prev)).toBeLessThan(0.02);
            prev = h;
          }
        }
        // Past the plan and its blend the terrain is the untouched field's.
      }
    }
  });

  it("is the untouched terrain past its blend, under the shore band and under the sea, so the coastline stays put", () => {
    for (const seed of SEEDS) {
      const { plain, town } = fields(seed);
      for (const [x, z] of aroundPlateaus(town.townPlateaus ?? [], 0.03)) {
        const h0 = plain.sampleHeight(x, z);
        const h1 = town.sampleHeight(x, z);
        expect(town.sampleCoastDistance(x, z)).toBe(plain.sampleCoastDistance(x, z));
        if (h0 <= SHORE_KEEP_BOTTOM) expect(h1).toBe(h0);
        if (h0 > 0) expect(h1).toBeGreaterThan(0);
        const beyond = (town.townPlateaus ?? []).every((o) => plateauPlanDistance(o, x, z) >= o.blend);
        if (beyond) expect(h1).toBe(h0);
      }
    }
  });
});
