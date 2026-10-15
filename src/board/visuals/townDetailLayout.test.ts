import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset, type MapSizeId } from "../../game/mapConfig";
import { createWrap } from "../../game/hex";
import { sharedTerrainField } from "./sharedTerrainField";
import { landSurface } from "./landMesh";
import { KERB_WIDTH, SHORE_KEEP_TOP, streetDistance } from "./townPlateau";
import { kerbRuns, streetEdgeStones, type TownSeed } from "./townDetailLayout";
import { BUILDING_SCALE } from "./worldScale";
import type { TerrainHeightField } from "./terrainHeightField";
import type { GroundField } from "./groundPlacement";

/**
 * The map sizes and seeds the kerbs are held on (#261): one pinned seed hid
 * the streets, on other seeds, that run along the shore band.
 */
const SWEEP: readonly (readonly [MapSizeId, readonly number[]])[] = [
  ["small", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
  ["medium", [1, 2, 3, 4, 5, 6, 7]],
  ["large", [1, 2, 3, 4, 5, 6]],
];

interface Town {
  field: TerrainHeightField;
  ground: GroundField;
  kerbs: TownSeed;
}

function town(size: MapSizeId, seed: number): Town {
  const preset = getMapPreset(size);
  const wrap = createWrap(preset.columns);
  const field = sharedTerrainField(generateMap(preset, seed, wrap), wrap, seed);
  /** Any town will do for the kerbs' shape: the stream only varies them. */
  const kerbs: TownSeed = { worldSeed: seed, portId: "0,0" };
  return { field, ground: landSurface(field), kerbs };
}

/** A seed's map, built before its tests and let go after them, so the sweep never holds every map at once. */
function sweptTown(size: MapSizeId, seed: number): () => Town {
  let built: Town | undefined;
  beforeAll(() => {
    built = town(size, seed);
  });
  afterAll(() => {
    built = undefined;
  });
  return () => {
    if (!built) throw new Error(`no ${size} map for seed ${seed}`);
    return built;
  };
}

describe.each(SWEEP)("street edge stones (#91), %s maps", (size, seeds) => {
  describe.each(seeds)("seed %i", (seed) => {
    const map = sweptTown(size, seed);
      it("lines both sides of every street, lanes included, with a kerb that runs on, not scattered stones", () => {
      const { field, ground, kerbs } = map();
        for (const p of field.townPlateaus) {
          const stones = streetEdgeStones(p, ground, BUILDING_SCALE, [], kerbs);
          for (const street of p.streets) {
            const len = Math.hypot(street.to[0] - street.from[0], street.to[1] - street.from[1]);
            const tx = (street.to[0] - street.from[0]) / len;
            const tz = (street.to[1] - street.from[1]) / len;
            const others = p.streets.filter((s) => s !== street);
            for (const side of [-1, 1]) {
              // This side's stones: by the edge, on this side of the centre line, not another street's.
              const mine = stones.filter((s) => {
                if (others.some((o) => streetDistance(o, s.x, s.z) < o.halfWidth * 1.5)) return false;
                const across = -(s.x - street.from[0]) * tz + (s.z - street.from[1]) * tx;
                const along = (s.x - street.from[0]) * tx + (s.z - street.from[1]) * tz;
                return Math.sign(across) === side && Math.abs(Math.abs(across) - street.halfWidth) < street.halfWidth * 0.5 && along > -1e-9 && along < len + 1e-9;
              });
              // Each runs along its street.
              for (const s of mine) expect(Math.abs(s.fx * tx + s.fz * tz)).toBeGreaterThan(0.99);
              // Laid end to end: where no other street crosses, they cover nearly all of the side.
              let open = 0;
              let covered = 0;
              for (let t = 0.005; t < len - 0.005; t += 0.001) {
                const x = street.from[0] + tx * t + -tz * side * (street.halfWidth - 0.001);
                const z = street.from[1] + tz * t + tx * side * (street.halfWidth - 0.001);
                if (others.some((o) => streetDistance(o, x, z) < o.halfWidth * 2)) continue;
                // Where a street runs out onto the beach it is not carved and has no kerb (#176).
                if (ground.sampleHeight(x, z) < SHORE_KEEP_TOP + 0.002) continue;
                open++;
                const along = (sx: number, sz: number) => (x - sx) * tx + (z - sz) * tz;
                if (mine.some((s) => Math.abs(along(s.x, s.z)) <= s.halfD + 1e-9)) covered++;
              }
              if (street.kind !== "main" && open > 0) expect(covered / open).toBeGreaterThan(0.85);
            }
          }
        }
      });

      it("stands every kerb a little proud of the ground beside it and sunk into it below", () => {
      const { field, ground, kerbs } = map();
        for (const p of field.townPlateaus) {
          for (const s of streetEdgeStones(p, ground, BUILDING_SCALE, [], kerbs)) {
            const g = ground.sampleHeight(s.x, s.z);
            // The ground beside it, either side across the kerb, where a bank or the street's carve falls away.
            const w = KERB_WIDTH * BUILDING_SCALE;
            const beside = Math.max(g, ground.sampleHeight(s.x - s.fz * w, s.z + s.fx * w), ground.sampleHeight(s.x + s.fz * w, s.z - s.fx * w));
            expect(s.y0).toBeLessThan(g);
            expect(s.y1).toBeGreaterThan(g);
            expect(s.y1 - beside).toBeLessThan(0.01 * BUILDING_SCALE);
          }
        }
      });
  });
});

describe("kerb runs (#261)", () => {
  it("finds each stretch where a street is kerbed, its ends to a tenth of a millimetre of world", () => {
    const runs = kerbRuns(0, 1, (t) => t < 0.3 || (t > 0.6 && t < 0.61) || t > 0.9);
    expect(runs).toHaveLength(3);
    const ends = [0, 0.3, 0.6, 0.61, 0.9, 1];
    runs.flat().forEach((t, i) => expect(Math.abs(t - ends[i])).toBeLessThan(1e-4));
  });

  it("is empty where nothing is kerbed, and the whole street where all of it is", () => {
    expect(kerbRuns(0.2, 1, () => false)).toEqual([]);
    expect(kerbRuns(0.2, 1, () => true)).toEqual([[0.2, 1]]);
  });
});
