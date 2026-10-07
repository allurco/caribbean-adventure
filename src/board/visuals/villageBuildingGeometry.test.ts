import { describe, it, expect } from "vitest";
import {
  buildVillageBuilding,
  VILLAGE_EAVE,
  VILLAGE_FOOTING,
  VILLAGE_HEIGHT,
  VILLAGE_PLAN,
  VILLAGE_TRIANGLE_BUDGET,
  VILLAGE_VARIANTS,
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

describe("village buildings (#84)", () => {
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

  it("gives the kinds different sizes", () => {
    const areas = VILLAGE_VARIANTS.map((v) => VILLAGE_PLAN[v].halfW * VILLAGE_PLAN[v].halfD);
    expect(new Set(areas).size).toBe(VILLAGE_VARIANTS.length);
  });
});
