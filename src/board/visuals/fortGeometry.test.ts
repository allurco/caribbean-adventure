import { describe, it, expect } from "vitest";
import { buildFortGeometry, fortOutline, FORT_FOOTING, FORT_TRIANGLE_BUDGET, type FortColors } from "./fortGeometry";
import { FORT_REACH, FORT_TOP } from "./portFort";
import { backfacingFirstHits } from "./facetVisibility";

const COLORS: FortColors = {
  stone: [0.5, 0.45, 0.4],
  cordon: [0.55, 0.5, 0.42],
  terreplein: [0.6, 0.55, 0.45],
  mortar: [0.1, 0.1, 0.1],
  timber: [0.3, 0.25, 0.2],
  iron: [0.05, 0.05, 0.05],
};

describe("buildFortGeometry (#84)", () => {
  const g = buildFortGeometry(COLORS);

  it("stays within its triangle budget", () => {
    expect(g.vertexCount / 3).toBeLessThanOrEqual(FORT_TRIANGLE_BUDGET);
  });

  it("has four arrow-head bastions reaching FORT_REACH on the diagonals", () => {
    const outline = fortOutline();
    expect(outline).toHaveLength(20);
    const tips = outline.filter((p) => Math.abs(Math.hypot(p[0], p[2]) - FORT_REACH) < 1e-9);
    expect(tips).toHaveLength(4);
  });

  it("fits its reach in plan, the staff's top in height and the footing under the ground", () => {
    for (let i = 0; i < g.vertexCount; i++) {
      const x = g.positions[i * 3];
      const y = g.positions[i * 3 + 1];
      const z = g.positions[i * 3 + 2];
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(FORT_REACH + 1e-6);
      expect(y).toBeLessThanOrEqual(FORT_TOP + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-FORT_FOOTING - 1e-6);
    }
  });

  it("shows no inside-out facet from above the ground", () => {
    expect(backfacingFirstHits(g, { minY: 0.001 })).toEqual([]);
  });
});
