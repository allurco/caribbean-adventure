import { describe, it, expect } from "vitest";
import { buildFortGeometry, fortFlag, fortOutline, FORT_FLAG_ENLARGEMENT, FORT_FLAG_HOIST, FORT_FOOTING, FORT_TRIANGLE_BUDGET, type FortColors } from "./fortGeometry";
import type { FacetGeometryData } from "./facetBuilder";
import { FORT_REACH, FORT_TOP } from "./portFort";
import { backfacingFirstHits } from "./facetVisibility";

const COLORS: FortColors = {
  stone: [0.5, 0.45, 0.4],
  cordon: [0.55, 0.5, 0.42],
  terreplein: [0.6, 0.55, 0.45],
  mortar: [0.1, 0.1, 0.1],
  timber: [0.3, 0.25, 0.2],
  iron: [0.05, 0.05, 0.05],
  whitewash: [0.8, 0.78, 0.72],
  roof: [0.3, 0.1, 0.06],
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
  }, 30000);

  it("lays its walls in blocks of varied stone, mossy at the foot", () => {
    // Distinct colours on the walls' outer faces below the cordón: far more than the old two bands.
    const colours = new Set<string>();
    let mossy = 0;
    for (let i = 0; i < g.vertexCount; i++) {
      const y = g.positions[i * 3 + 1];
      if (y <= 0 || y > 0.09) continue;
      const r = g.colors[i * 3];
      const gr = g.colors[i * 3 + 1];
      const b = g.colors[i * 3 + 2];
      colours.add(`${r.toFixed(3)},${gr.toFixed(3)},${b.toFixed(3)}`);
      if (gr / r > (COLORS.stone[1] / COLORS.stone[0]) * 1.05) mossy++;
    }
    expect(colours.size).toBeGreaterThan(100);
    expect(mossy).toBeGreaterThan(0);
  });

  it("flies an enlarged flag from the same hoist", () => {
    const flag: FacetGeometryData = { positions: new Float32Array([...FORT_FLAG_HOIST, FORT_FLAG_HOIST[0] + 0.1, FORT_FLAG_HOIST[1], FORT_FLAG_HOIST[2], FORT_FLAG_HOIST[0], FORT_FLAG_HOIST[1] - 0.05, FORT_FLAG_HOIST[2]]), normals: new Float32Array(9), colors: new Float32Array(9), vertexCount: 3 };
    const big = fortFlag(flag);
    expect(big.positions[0]).toBeCloseTo(FORT_FLAG_HOIST[0], 6);
    expect(big.positions[3] - FORT_FLAG_HOIST[0]).toBeCloseTo(0.1 * FORT_FLAG_ENLARGEMENT, 6);
    expect(FORT_FLAG_HOIST[1] - big.positions[7]).toBeCloseTo(0.05 * FORT_FLAG_ENLARGEMENT, 6);
  });
});
