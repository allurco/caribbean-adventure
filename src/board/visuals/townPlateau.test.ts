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
  FORT_PIER_GAP,
  FORT_TOWN_GAP,
  fortPadWeight,
  plateauPlanDistance,
  shoreKeep,
  type TownPlateau,
} from "./townPlateau";
import { FORT_KEEP_TOP, portHasFort } from "./portFort";
import { VIEW_LINE_SLOPE } from "./islandMassifs";

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
        // Only where no other plateau, and no fort's pad, reaches.
        if ((town.townPlateaus ?? []).some((o) => o !== p && plateauPlanDistance(o, x, z) < o.blend)) continue;
        if ((town.townPlateaus ?? []).some((o) => o.fort && fortPadWeight(o.fort, x, z) > 0)) continue;
        expect(town.sampleHeight(x, z)).toBeCloseTo(level, 12);
        checked++;
      }
      expect(checked).toBeGreaterThan(50);
    }
  });

  it("blends into the untouched terrain without a step", () => {
    for (const seed of SEEDS) {
      const { plain, town } = fields(seed);
      for (const p of town.townPlateaus ?? []) {
        // Rays from the centre out past the blend (and any fort's pad), in
        // 0.004 steps: no step more than the untouched terrain's own plus 0.02.
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          let prev = town.sampleHeight(p.x, p.z);
          let prevPlain = plain.sampleHeight(p.x, p.z);
          for (let r = 0.004; r <= p.reach; r += 0.004) {
            const x = p.x + Math.sin(a) * r;
            const z = p.z + Math.cos(a) * r;
            const h = town.sampleHeight(x, z);
            const h0 = plain.sampleHeight(x, z);
            expect(Math.abs(h - prev)).toBeLessThan(Math.abs(h0 - prevPlain) + 0.02);
            prev = h;
            prevPlain = h0;
          }
        }
      }
    }
  });

  it("finds forts only on fort ports, clear of the village and the pier, wholly above the shore band", () => {
    let forts = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const preset = getMapPreset("small");
      const wrap = createWrap(preset.columns);
      const cells = generateMap(preset, seed, wrap);
      const plain = createTerrainHeightField(cells, terrainSeedFromCells(cells), { wrap });
      const town = createTerrainHeightField(cells, terrainSeedFromCells(cells), { wrap, townPlateaus: { scale: SCALE, buildingScale: SCALE * 1.125 } });
      const ports = cells.filter((c) => c.hasPort && c.decorations?.some((d) => d.type === "pier"));
      (town.townPlateaus ?? []).forEach((p, i) => {
        if (!p.fort) return;
        forts++;
        expect(portHasFort(ports[i])).toBe(true);
        expect(plateauPlanDistance(p, p.fort.x, p.fort.z)).toBeGreaterThanOrEqual(p.fort.reach + FORT_TOWN_GAP - 1e-9);
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          expect(plain.sampleHeight(p.fort.x + Math.cos(a) * p.fort.reach, p.fort.z + Math.sin(a) * p.fort.reach)).toBeGreaterThan(SHORE_KEEP_TOP);
        }
        // The pad is level under the whole fort.
        for (let r = 0; r <= p.fort.reach; r += p.fort.reach / 4) {
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const x = p.fort.x + Math.cos(a) * r;
            const z = p.fort.z + Math.sin(a) * r;
            if (shoreKeep(plain.sampleHeight(x, z)) < 1) continue;
            expect(town.sampleHeight(x, z)).toBeCloseTo(p.fort.level, 12);
          }
        }
        // South of its square (towards the camera) a fort stays under the line of sight to the square.
        const southOf = Math.max(0, p.fort.z - p.fort.reach - p.z);
        if (p.fort.z > p.z && Math.abs(p.fort.x - p.x) < 1 + southOf * 0.35 + p.fort.reach) {
          const south = southOf;
          expect(p.fort.level + FORT_KEEP_TOP * SCALE * 1.125).toBeLessThanOrEqual(p.levels[0] + south * VIEW_LINE_SLOPE);
        }
        expect(FORT_PIER_GAP).toBeGreaterThan(0);
      });
      ports.forEach((c, i) => {
        if (!portHasFort(c)) expect(town.townPlateaus?.[i].fort).toBeUndefined();
      });
    }
    expect(forts).toBeGreaterThan(0);
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
        const beyond = (town.townPlateaus ?? []).every(
          (o) => plateauPlanDistance(o, x, z) >= o.blend && (!o.fort || fortPadWeight(o.fort, x, z) === 0)
        );
        if (beyond) expect(h1).toBe(h0);
      }
    }
  });
});
