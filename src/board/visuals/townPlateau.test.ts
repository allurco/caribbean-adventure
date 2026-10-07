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
  crossesRiser,
  plateauLevel,
  plateauPoint,
  plateauPlanDistance,
  riserCentre,
  shoreKeep,
  streetCarveAt,
  type TownPlateau,
} from "./townPlateau";
import { PROP_SCALE } from "./worldScale";

const SCALE = PROP_SCALE;

/** The field as drawn (towns on, the default) and the same field without them. */
function fields(seed: number): { plain: TerrainHeightField; town: TerrainHeightField } {
  const preset = getMapPreset("small");
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, seed, wrap);
  const terrainSeed = terrainSeedFromCells(cells);
  return {
    plain: createTerrainHeightField(cells, terrainSeed, { wrap, towns: false }),
    town: createTerrainHeightField(cells, terrainSeed, { wrap }),
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
const built = new Map(SEEDS.map((seed) => [seed, fields(seed)]));
const fieldsOf = (seed: number) => built.get(seed) ?? fields(seed);

describe("town plateaus (#87)", () => {
  it("are part of the field by default, one per port with a pier, and none when turned off", () => {
    const preset = getMapPreset("small");
    for (const seed of SEEDS) {
      const { plain, town } = fieldsOf(seed);
      expect(plain.townPlateaus).toEqual([]);
      const cells = generateMap(preset, seed, createWrap(preset.columns));
      const piers = cells.filter((c) => c.hasPort && c.decorations?.some((d) => d.type === "pier")).length;
      expect(town.townPlateaus).toHaveLength(piers);
      expect(piers).toBeGreaterThan(0);
    }
  });

  it("plans one to three terraces stepping up by at most a riser", () => {
    for (const seed of SEEDS) {
      for (const p of fieldsOf(seed).town.townPlateaus) {
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

  it("is exactly flat on the square and each terrace, away from the risers and the shore band, but for the carved streets", () => {
    for (const seed of SEEDS) {
      const { plain, town } = fieldsOf(seed);
      const plateaus = town.townPlateaus;
      let checked = 0;
      for (const [x, z, p] of aroundPlateaus(plateaus, 0.02)) {
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
        if (plateaus.some((o) => o !== p && plateauPlanDistance(o, x, z) < o.blend)) continue;
        expect(town.sampleHeight(x, z)).toBeCloseTo(level - streetCarveAt(p, x, z) * p.carve, 12);
        checked++;
      }
      expect(checked).toBeGreaterThan(50);
    }
  });

  it("blends into the untouched terrain without a step", () => {
    for (const seed of SEEDS) {
      const { plain, town } = fieldsOf(seed);
      for (const p of town.townPlateaus) {
        // Rays from the centre out past the blend in 0.004 steps: no step more
        // than the untouched terrain's own plus 0.02 and half a riser (the
        // steep face).
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

  it("lays a main street, two back lanes and one or two cross lanes inside the plan, carved into the ground", () => {
    for (const seed of SEEDS) {
      for (const p of fieldsOf(seed).town.townPlateaus) {
        const kinds = p.streets.map((s) => s.kind);
        expect(kinds.filter((k) => k === "main")).toHaveLength(1);
        expect(kinds.filter((k) => k === "back")).toHaveLength(2);
        expect(kinds.filter((k) => k === "cross").length).toBeGreaterThanOrEqual(1);
        for (const street of p.streets) {
          for (const end of [street.from, street.to]) expect(plateauPlanDistance(p, end[0], end[1])).toBeLessThan(1e-9);
        }
        // The main street's middle is carved the full depth below its edge's ground.
        const main = p.streets[0];
        expect(streetCarveAt(p, (main.from[0] + main.to[0]) / 2, (main.from[1] + main.to[1]) / 2)).toBe(1);
      }
    }
  });

  it("makes each riser a steep face, but a ramp where the main street climbs it", () => {
    for (const seed of SEEDS) {
      for (const p of fieldsOf(seed).town.townPlateaus) {
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

  it("says when a footprint crosses a riser or the wall at its foot, and not when it stands on one terrace", () => {
    const p = fieldsOf(1).town.townPlateaus[0];
    const wall = 0.005;
    const square = (s: number, across: number, half: number) =>
      [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half],
      ].map(([ds, da]) => plateauPoint(p, s + ds, across + da));
    const c = riserCentre(p, 0);
    // Off the climbs, on the bare face: across it, on the wall in front of it, and clear on either side.
    const across = p.climbs[1] / 2;
    expect(crossesRiser(p, square(c, across, 0.01), wall)).toBe(true);
    expect(crossesRiser(p, square(c - p.riserFace / 2 - wall / 2 - 0.004, across, 0.003), wall)).toBe(true);
    expect(crossesRiser(p, square(c - p.riserFace / 2 - wall - 0.02, across, 0.015), wall)).toBe(false);
    expect(crossesRiser(p, square(c + p.riserFace / 2 + 0.02, across, 0.015), wall)).toBe(false);
    // Where the main street climbs, the riser is the whole ramp.
    expect(crossesRiser(p, square(c + p.riserFace / 2 + 0.01, 0, 0.005), wall)).toBe(true);
    // Far out to the side, past the blend, there is no riser.
    expect(crossesRiser(p, square(c, p.halfWidth + p.blend + 0.1, 0.01), wall)).toBe(false);
  });

  it("is the untouched terrain past its blend, under the shore band and under the sea, so the coastline stays put", () => {
    for (const seed of SEEDS) {
      const { plain, town } = fieldsOf(seed);
      const plateaus = town.townPlateaus;
      for (const [x, z] of aroundPlateaus(plateaus, 0.03)) {
        const h0 = plain.sampleHeight(x, z);
        const h1 = town.sampleHeight(x, z);
        expect(town.sampleCoastDistance(x, z)).toBe(plain.sampleCoastDistance(x, z));
        if (h0 <= SHORE_KEEP_BOTTOM) expect(h1).toBe(h0);
        if (h0 > 0) expect(h1).toBeGreaterThan(0);
        if (plateaus.every((o) => plateauPlanDistance(o, x, z) >= o.blend)) expect(h1).toBe(h0);
      }
    }
  }, 30000);

  it("is planned on the field without plateaus, so a port's plan does not depend on its neighbours'", () => {
    for (const seed of SEEDS) {
      const { town } = fieldsOf(seed);
      const preset = getMapPreset("small");
      const wrap = createWrap(preset.columns);
      const cells = generateMap(preset, seed, wrap);
      const ports = cells.filter((c) => c.hasPort && c.decorations?.some((d) => d.type === "pier"));
      // Each port alone on the map plans the same plateau it plans among the others.
      const alone = createTerrainHeightField(
        cells.map((c) => (c === ports[ports.length - 1] || !c.hasPort ? c : { ...c, hasPort: false })),
        terrainSeedFromCells(cells),
        { wrap }
      );
      expect(alone.townPlateaus[0]).toEqual(town.townPlateaus[town.townPlateaus.length - 1]);
    }
  });
});
