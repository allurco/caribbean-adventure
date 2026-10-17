import { describe, it, expect } from "vitest";
import {
  buildVillageBuilding,
  VILLAGE_EAVE,
  VILLAGE_FOOTING,
  VILLAGE_HEIGHT,
  VILLAGE_PLAN,
  VILLAGE_TRIANGLE_BUDGET,
  VILLAGE_VARIANTS,
  VILLAGE_STOREYS,
  villageAnchors,
  villageRoofPitch,
  type VillageVariant,
} from "./villageBuildingGeometry";
import { backfacingFirstHits } from "./facetVisibility";
import type { AgedColors } from "./agedKit";

const COLORS: AgedColors = {
  wall: [0.8, 0.75, 0.65],
  roof: [0.35, 0.12, 0.07],
  timber: [0.08, 0.06, 0.05],
  stone: [0.4, 0.36, 0.32],
  iron: [0.02, 0.02, 0.02],
  bronze: [0.2, 0.15, 0.1],
};

describe("village buildings (#87)", () => {
  for (const variant of VILLAGE_VARIANTS) {
    describe(variant, () => {
      const g = buildVillageBuilding(variant, COLORS, 3);

      it("stays within the triangle budget", () => {
        expect(g.data.vertexCount / 3).toBeLessThanOrEqual(VILLAGE_TRIANGLE_BUDGET);
      });

      it("reports a roof range inside the build", () => {
        expect(g.roofFrom).toBeGreaterThanOrEqual(0);
        expect(g.roofTo).toBeGreaterThan(g.roofFrom);
        expect(g.roofTo).toBeLessThanOrEqual(g.data.vertexCount);
      });

      it("fits its plan and eaves, its height, and keeps its footing under the ground", () => {
        const plan = VILLAGE_PLAN[variant];
        const eave = VILLAGE_EAVE[variant];
        for (let i = 0; i < g.data.vertexCount; i++) {
          const x = g.data.positions[i * 3];
          const y = g.data.positions[i * 3 + 1];
          const z = g.data.positions[i * 3 + 2];
          expect(Math.abs(x)).toBeLessThanOrEqual(plan.halfW + eave + 0.012);
          expect(Math.abs(z)).toBeLessThanOrEqual(plan.halfD + eave + 0.012);
          expect(y).toBeLessThanOrEqual(VILLAGE_HEIGHT[variant] + 0.012);
          expect(y).toBeGreaterThanOrEqual(-VILLAGE_FOOTING - 1e-6);
        }
      });

      // From the board camera's elevations (35° and up). Rays skimming under
      // an eave at a lower angle meet the shared aged roof's uneven tile ends
      // at its corners from below on some seeds (agedRoof.ts, not these
      // bodies), which no board view sees.
      it("shows no inside-out facet from the board camera's elevations", () => {
        for (const seed of [0, 3]) {
          const built = buildVillageBuilding(variant, COLORS, seed);
          expect(backfacingFirstHits(built.data, { minY: 0.002, elevations: [0.6, 0.9, 1.2] })).toEqual([]);
        }
      }, 30000);
    });
  }

  it("has a three-storey town house, the village's tallest, a storey over the two-storey houses (#176)", () => {
    expect(VILLAGE_VARIANTS).toContain("townHouse");
    expect(VILLAGE_STOREYS.townHouse).toBe(3);
    expect(VILLAGE_STOREYS.stoneHouse).toBe(2);
    expect(VILLAGE_STOREYS.merchant).toBe(2);
    expect(VILLAGE_STOREYS.cottage).toBe(1);
    for (const v of VILLAGE_VARIANTS) if (v !== "townHouse") expect(VILLAGE_HEIGHT.townHouse).toBeGreaterThan(VILLAGE_HEIGHT[v]);
    // Narrower than the merchant's house, about a cottage's width: a tall house on a narrow plot.
    expect(VILLAGE_PLAN.townHouse.halfW).toBeLessThan(VILLAGE_PLAN.merchant.halfW);
  });

  it("pitches the houses' roofs at 55° or steeper and the warehouse's at 45° (#176)", () => {
    for (const v of ["cottage", "stoneHouse", "merchant", "townHouse"] as const) expect((villageRoofPitch(v) * 180) / Math.PI).toBeGreaterThanOrEqual(55);
    expect((villageRoofPitch("warehouse") * 180) / Math.PI).toBeGreaterThanOrEqual(45);
  });

  it("gives the kinds different sizes", () => {
    const areas = VILLAGE_VARIANTS.map((v) => VILLAGE_PLAN[v].halfW * VILLAGE_PLAN[v].halfD);
    expect(new Set(areas).size).toBe(VILLAGE_VARIANTS.length);
  });

  describe("the anchors later slices smoke and light (#181)", () => {
    const counts: Readonly<Record<VillageVariant, { chimneys: number; windows: number; lanterns: number }>> = {
      cottage: { chimneys: 1, windows: 1, lanterns: 1 },
      stoneHouse: { chimneys: 1, windows: 3, lanterns: 1 },
      merchant: { chimneys: 2, windows: 4, lanterns: 1 },
      townHouse: { chimneys: 1, windows: 5, lanterns: 1 },
      warehouse: { chimneys: 0, windows: 0, lanterns: 1 },
      leanTo: { chimneys: 0, windows: 0, lanterns: 0 },
    };
    for (const variant of VILLAGE_VARIANTS) {
      it(`gives the ${variant} a chimney mouth per chimney, a point per shuttered window and a lantern by its door`, () => {
        const a = villageAnchors(variant);
        expect({ chimneys: a.chimneys.length, windows: a.windows.length, lanterns: a.lanterns.length }).toEqual(counts[variant]);
      });

      it(`puts the ${variant}'s anchors on the building as built: chimney mouths at a chimney's top, windows and lanterns on the front wall`, () => {
        const g = buildVillageBuilding(variant, COLORS, 0);
        const a = villageAnchors(variant);
        const nearest = (p: readonly number[]) => {
          let best = Infinity;
          for (let i = 0; i < g.data.vertexCount; i++) {
            best = Math.min(best, Math.hypot(g.data.positions[i * 3] - p[0], g.data.positions[i * 3 + 1] - p[1], g.data.positions[i * 3 + 2] - p[2]));
          }
          return best;
        };
        for (const c of a.chimneys) {
          // The soot at the mouth: a vertex within the flue's half width, nothing of the chimney above it.
          expect(nearest(c)).toBeLessThan(0.016);
          expect(c[1]).toBeGreaterThan(VILLAGE_HEIGHT[variant] - 0.02);
        }
        for (const w of [...a.windows, ...a.lanterns]) {
          expect(nearest(w)).toBeLessThan(0.03);
          // On the front: at or just proud of the front wall, within its width, between the ground and the eaves.
          expect(w[2]).toBeGreaterThan(VILLAGE_PLAN[variant].halfD - 0.01);
          expect(w[2]).toBeLessThan(VILLAGE_PLAN[variant].halfD + 0.03);
          expect(Math.abs(w[0])).toBeLessThan(VILLAGE_PLAN[variant].halfW + 0.01);
          expect(w[1]).toBeGreaterThan(0.02);
        }
      });
    }

    it("is the same for every wear seed: the anchors follow the model, not its wear", () => {
      for (const variant of VILLAGE_VARIANTS) expect(villageAnchors(variant)).toEqual(buildVillageBuilding(variant, COLORS, 3).anchors);
    });
  });
});
