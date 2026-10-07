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
  FORT_ROAD_GRADE,
  FORT_ROAD_MAX_LEGS,
  FORT_TOWN_GAP,
  fortPadWeight,
  fortRoadAt,
  plateauLevel,
  plateauLocal,
  plateauPlanDistance,
  riserCentre,
  shoreKeep,
  streetCarveAt,
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
        // Only where no other plateau, and no fort's pad or road, reaches.
        if ((town.townPlateaus ?? []).some((o) => o !== p && plateauPlanDistance(o, x, z) < o.blend)) continue;
        if ((town.townPlateaus ?? []).some((o) => o.fort && fortPadWeight(o.fort, x, z) > 0)) continue;
        if ((town.townPlateaus ?? []).some((o) => o.fortRoad && fortRoadAt(o.fortRoad, x, z).weight > 0)) continue;
        // A street is carved into its terrace by up to its carve depth.
        expect(town.sampleHeight(x, z)).toBeCloseTo(level - streetCarveAt(p, x, z) * p.carve, 12);
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
        // 0.004 steps: no step more than the untouched terrain's own plus
        // 0.02 and a riser's rise over its steep face.
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          let prev = town.sampleHeight(p.x, p.z);
          let prevPlain = plain.sampleHeight(p.x, p.z);
          for (let r = 0.004; r <= p.reach; r += 0.004) {
            const x = p.x + Math.sin(a) * r;
            const z = p.z + Math.cos(a) * r;
            const h = town.sampleHeight(x, z);
            const h0 = plain.sampleHeight(x, z);
            expect(Math.abs(h - prev)).toBeLessThan(Math.abs(h0 - prevPlain) + 0.02 + RISER * SCALE * 0.5);
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

  it("lays a main street, two back lanes and one or two cross lanes inside the plan, carved into the ground", () => {
    for (const seed of SEEDS) {
      const { town } = fields(seed);
      for (const p of town.townPlateaus ?? []) {
        const kinds = p.streets.map((s) => s.kind);
        expect(kinds.filter((k) => k === "main")).toHaveLength(1);
        expect(kinds.filter((k) => k === "back")).toHaveLength(2);
        expect(kinds.filter((k) => k === "cross").length).toBeGreaterThanOrEqual(1);
        for (const street of p.streets) {
          for (const end of [street.from, street.to]) expect(plateauPlanDistance(p, end[0], end[1])).toBeLessThan(1e-9);
        }
        // The main street's middle is carved the full depth below its edge's ground.
        const main = p.streets[0];
        const mx = (main.from[0] + main.to[0]) / 2;
        const mz = (main.from[1] + main.to[1]) / 2;
        expect(streetCarveAt(p, mx, mz)).toBe(1);
      }
    }
  });

  it("makes each riser a steep face, but a ramp where the main street climbs it", () => {
    for (const seed of SEEDS) {
      const { town } = fields(seed);
      for (const p of town.townPlateaus ?? []) {
        for (let k = 0; k < p.steps.length; k++) {
          const c = riserCentre(p, k);
          const rise = p.levels[k + 1] - p.levels[k];
          if (rise < 1e-6) continue;
          // Halfway between the main street and a back lane, clear of both climbs.
          const edge = p.climbs[1] / 2;
          // Off the streets the whole rise is within the face; on the main street it is spread over the ramp.
          expect(plateauLevel(p, c + p.riserFace / 2, edge) - plateauLevel(p, c - p.riserFace / 2, edge)).toBeCloseTo(rise, 9);
          expect(plateauLevel(p, c + p.riserFace / 2, 0) - plateauLevel(p, c - p.riserFace / 2, 0)).toBeLessThan(rise * 0.6);
        }
      }
    }
  });

  it("runs a fort road from the fort's pad to the town at no more than its grade (or as near as its legs allow)", () => {
    let roads = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const preset = getMapPreset("small");
      const wrap = createWrap(preset.columns);
      const cells = generateMap(preset, seed, wrap);
      const town = createTerrainHeightField(cells, terrainSeedFromCells(cells), { wrap, townPlateaus: { scale: SCALE, buildingScale: SCALE * 1.125 } });
      for (const p of town.townPlateaus ?? []) {
        if (!p.fort) continue;
        const road = p.fortRoad;
        expect(road).toBeDefined();
        if (!road) continue;
        roads++;
        const [sx, sz] = road.points[0];
        expect(Math.hypot(sx - p.fort.x, sz - p.fort.z)).toBeLessThanOrEqual(p.fort.padRadius + 1e-9);
        const [ex, ez] = road.points[road.points.length - 1];
        expect(plateauPlanDistance(p, ex, ez)).toBeLessThan(1e-9);
        const { s, across } = plateauLocal(p, ex, ez);
        expect(road.levels[road.levels.length - 1]).toBeCloseTo(plateauLevel(p, s, across), 12);
        let length = 0;
        for (let i = 1; i < road.points.length; i++) length += Math.hypot(road.points[i][0] - road.points[i - 1][0], road.points[i][1] - road.points[i - 1][1]);
        const grade = Math.abs(road.levels[0] - road.levels[road.levels.length - 1]) / length;
        // Within the grade unless the legs ran out (a citadel high over its town); never a cliff.
        if (road.points.length < FORT_ROAD_MAX_LEGS + 1) expect(grade).toBeLessThanOrEqual(FORT_ROAD_GRADE * 1.05);
        expect(grade).toBeLessThan(0.35);
      }
    }
    expect(roads).toBeGreaterThan(0);
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
          (o) =>
            plateauPlanDistance(o, x, z) >= o.blend &&
            (!o.fort || fortPadWeight(o.fort, x, z) === 0) &&
            (!o.fortRoad || fortRoadAt(o.fortRoad, x, z).weight === 0)
        );
        if (beyond) expect(h1).toBe(h0);
      }
    }
  }, 30000);
});
