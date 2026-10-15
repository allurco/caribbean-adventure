import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset, type MapSizeId } from "../../game/mapConfig";
import { createWrap } from "../../game/hex";
import { sharedTerrainField } from "./sharedTerrainField";
import { landSurface } from "./landMesh";
import { KERB_WIDTH, SHORE_KEEP_TOP, streetDistance } from "./townPlateau";
import { fitKerbStones, kerbRuns, kerbStoneCount, streetEdgeStones, type EdgeStone, type TownSeed } from "./townDetailLayout";
import { BUILDING_SCALE } from "./worldScale";
import type { TerrainHeightField } from "./terrainHeightField";
import type { GroundField } from "./groundPlacement";

/**
 * The map sizes and seeds the kerbs are held on (#261): one pinned seed hid
 * the streets, on other seeds, that run along the shore band.
 */
const SWEEP: readonly (readonly [MapSizeId, readonly number[]])[] = [
  ["small", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
  ["medium", [1, 2]],
  ["large", [1, 2]],
];

/** A seed's map: its field, the ground as drawn, and each plateau's kerbs (in the order of `field.townPlateaus`). */
interface Town {
  field: TerrainHeightField;
  ground: GroundField;
  stones: EdgeStone[][];
}

function town(size: MapSizeId, seed: number): Town {
  const preset = getMapPreset(size);
  const wrap = createWrap(preset.columns);
  const field = sharedTerrainField(generateMap(preset, seed, wrap), wrap, seed);
  const ground = landSurface(field);
  /** Any town will do for the kerbs' shape: the stream only varies them. */
  const kerbs: TownSeed = { worldSeed: seed, portId: "0,0" };
  return { field, ground, stones: field.townPlateaus.map((p) => streetEdgeStones(p, ground, BUILDING_SCALE, [], kerbs)) };
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
      const { field, ground, stones: kerbsOf } = map();
      field.townPlateaus.forEach((p, plateauIndex) => {
        const stones = kerbsOf[plateauIndex];
        for (const street of p.streets) {
          const len = Math.hypot(street.to[0] - street.from[0], street.to[1] - street.from[1]);
          const tx = (street.to[0] - street.from[0]) / len;
          const tz = (street.to[1] - street.from[1]) / len;
          const others = p.streets.filter((s) => s !== street);
          const alongOf = (x: number, z: number) => (x - street.from[0]) * tx + (z - street.from[1]) * tz;
          for (const side of [-1, 1]) {
            // This side's stones: by the edge, on this side of the centre line, not another street's; in order along it.
            const mine = stones
              .filter((s) => {
                if (others.some((o) => streetDistance(o, s.x, s.z) < o.halfWidth * 1.5)) return false;
                const across = -(s.x - street.from[0]) * tz + (s.z - street.from[1]) * tx;
                const along = alongOf(s.x, s.z);
                return Math.sign(across) === side && Math.abs(Math.abs(across) - street.halfWidth) < street.halfWidth * 0.5 && along > -1e-9 && along < len + 1e-9;
              })
              .map((s) => ({ stone: s, along: alongOf(s.x, s.z) }))
              .sort((a, b) => a.along - b.along);
            // Each runs along its street (one expect per side: one per stone was most of the sweep's time).
            expect(mine.every(({ stone }) => Math.abs(stone.fx * tx + stone.fz * tz) > 0.99)).toBe(true);
            /** Whether a stone covers `t` along the street: the last one centred at or before it, or the next. */
            const covers = (t: number) => {
              let lo = 0;
              let hi = mine.length;
              while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (mine[mid].along <= t) lo = mid + 1;
                else hi = mid;
              }
              return [lo - 1, lo].some((i) => i >= 0 && i < mine.length && Math.abs(t - mine[i].along) <= mine[i].stone.halfD + 1e-9);
            };
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
              if (covers(t)) covered++;
            }
            if (street.kind !== "main" && open > 0) expect(covered / open).toBeGreaterThan(0.85);
          }
        }
      });
    });

    it("stands every kerb a little proud of the ground beside it and sunk into it below", () => {
      const { ground, stones } = map();
      // The stones that fail, asserted once: three expects per stone were most of the sweep's time.
      const wrong: string[] = [];
      for (const s of stones.flat()) {
        const g = ground.sampleHeight(s.x, s.z);
        // The ground beside it, either side across the kerb, where a bank or the street's carve falls away.
        const w = KERB_WIDTH * BUILDING_SCALE;
        const beside = Math.max(g, ground.sampleHeight(s.x - s.fz * w, s.z + s.fx * w), ground.sampleHeight(s.x + s.fz * w, s.z - s.fx * w));
        if (!(s.y0 < g && s.y1 > g && s.y1 - beside < 0.01 * BUILDING_SCALE)) wrong.push(`(${s.x}, ${s.z}): ${s.y0}..${s.y1}, ground ${g}, beside ${beside}`);
      }
      expect(wrong).toEqual([]);
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

describe("kerb stones fitted to a run (#261)", () => {
  it("takes as many stones as fill the run most nearly at their mean length, and at least one", () => {
    expect(kerbStoneCount(0.1, 0.016, 0.0015)).toBe(6);
    expect(kerbStoneCount(0.0272, 0.016, 0.0015)).toBe(2);
    expect(kerbStoneCount(0.012, 0.016, 0.0015)).toBe(1);
    expect(kerbStoneCount(0.004, 0.016, 0.0015)).toBe(1);
  });

  it("fills the run end to end, the stones in order and the gaps kept", () => {
    const stones = fitKerbStones(1, 1.05, [0.015, 0.02, 0.012], 0.0015);
    expect(stones[0].at - stones[0].length / 2).toBeCloseTo(1, 9);
    expect(stones[2].at + stones[2].length / 2).toBeCloseTo(1.05, 9);
    expect(stones[1].at - stones[1].length / 2 - (stones[0].at + stones[0].length / 2)).toBeCloseTo(0.0015, 9);
    // Each stretched alike: the lengths keep their proportions.
    expect(stones[1].length / stones[0].length).toBeCloseTo(0.02 / 0.015, 9);
  });

  it("stretches or shrinks a stone by no more than a quarter, centring the stones on a run they cannot fill", () => {
    const long = fitKerbStones(0, 0.03, [0.016], 0.0015);
    expect(long[0].length).toBeCloseTo(0.016 * 1.25, 9);
    expect(long[0].at).toBeCloseTo(0.015, 9);
    const short = fitKerbStones(0, 0.009, [0.016], 0.0015);
    expect(short[0].length).toBeCloseTo(0.016 * 0.8, 9);
    expect(short[0].at).toBeCloseTo(0.0045, 9);
  });
});
