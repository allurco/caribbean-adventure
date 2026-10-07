import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap } from "../../game/hex";
import { createTerrainHeightField, SEA_LEVEL, terrainSeedFromCells, type TerrainHeightField } from "./terrainHeightField";
import { buildLandMesh, landSurface, TOWN_FLAG_MARGIN } from "./landMesh";
import { townGround, TOWN_REFINE } from "./townGround";
import { plateauPoint } from "./townPlateau";

const SCALE = 115 / 350;

function fields(seed: number): { plain: TerrainHeightField; town: TerrainHeightField } {
  const preset = getMapPreset("small");
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, seed, wrap);
  const terrainSeed = terrainSeedFromCells(cells);
  return {
    plain: createTerrainHeightField(cells, terrainSeed, { wrap }),
    town: createTerrainHeightField(cells, terrainSeed, { wrap, townPlateaus: { scale: SCALE, buildingScale: SCALE * 1.125 } }),
  };
}

/** Edges of an unindexed triangle soup used by only one triangle, with both ends well above the sea (a crack, or a T-junction). */
function openEdges(positions: Float32Array): number {
  const key = (i: number) => `${positions[i * 3]},${positions[i * 3 + 2]}`;
  const edges = new Map<string, number>();
  const triangles = positions.length / 9;
  const edgeOf = (i: number, j: number) => {
    const a = key(i);
    const b = key(j);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  for (let t = 0; t < triangles; t++) for (let k = 0; k < 3; k++) edges.set(edgeOf(t * 3 + k, t * 3 + ((k + 1) % 3)), (edges.get(edgeOf(t * 3 + k, t * 3 + ((k + 1) % 3))) ?? 0) + 1);
  let open = 0;
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      const j = t * 3 + ((k + 1) % 3);
      if (edges.get(edgeOf(i, j)) !== 1) continue;
      if (positions[i * 3 + 1] > SEA_LEVEL + 0.01 && positions[j * 3 + 1] > SEA_LEVEL + 0.01) open++;
    }
  }
  return open;
}

describe("town ground (#84)", () => {
  const { plain, town } = fields(1);
  const plateaus = town.townPlateaus ?? [];

  it("is absent without plateaus", () => {
    expect(townGround([], null, TOWN_FLAG_MARGIN)).toBeUndefined();
  });

  it("flags the town and its fort road, not open country, and says what the ground is", () => {
    const ground = townGround(plateaus, town.periodX, TOWN_FLAG_MARGIN);
    expect(ground).toBeDefined();
    if (!ground) return;
    for (const p of plateaus) {
      expect(ground.flag(p.x, p.z)).toBe(true);
      expect(ground.flag(p.x + 3, p.z + 3)).toBe(false);
      const main = p.streets[0];
      expect(ground.surface((main.from[0] + main.to[0]) / 2, (main.from[1] + main.to[1]) / 2)).toBe("paved");
      const back = p.streets.find((s) => s.kind === "back");
      if (back) expect(ground.surface((back.from[0] + back.to[0]) / 2, (back.from[1] + back.to[1]) / 2)).toBe("earth");
      const [ox, oz] = plateauPoint(p, p.length * 0.5, (p.climbs[1] ?? 0) / 2);
      expect(ground.surface(ox, oz)).toBe("ground");
      if (p.fortRoad) {
        const [rx, rz] = p.fortRoad.points[1];
        expect(ground.flag(rx, rz)).toBe(true);
        expect(ground.surface(rx, rz)).toBe("road");
      }
    }
  });

  it("refines the land mesh round the towns without a crack, and the drawn surface matches it", () => {
    const coarse = buildLandMesh(plain);
    const fine = buildLandMesh(town);
    expect(fine.aboveWaterTriangleCount).toBeGreaterThan(coarse.aboveWaterTriangleCount + plateaus.length * TOWN_REFINE * TOWN_REFINE * 20);
    // Every land edge is shared by two land triangles, unless it is on the
    // waterline (shared with the seabed) or on the wrap seam: as many open
    // edges high on the land as the coarse mesh has, no more.
    expect(openEdges(fine.land.positions)).toBe(openEdges(coarse.land.positions));
    const { positions } = fine.land;
    // The ground placement surface agrees with the drawn mesh at its vertices in the towns.
    const surface = landSurface(town);
    let checked = 0;
    for (let i = 0; i < positions.length / 3; i += 7) {
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      if (!plateaus.some((p) => Math.hypot(x - p.x, z - p.z) < p.reach)) continue;
      expect(surface.sampleHeight(x, z)).toBeCloseTo(positions[i * 3 + 1], 4);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
});
