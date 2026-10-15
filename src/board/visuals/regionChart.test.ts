import { describe, it, expect } from "vitest";
import { regionChartSize, REGION_CHART_MAX_SIZE, REGION_CHART_TEXELS_PER_UNIT } from "./regionChart";

describe("regionChartSize (#239)", () => {
  it("draws a small map's chart at the full density", () => {
    const size = regionChartSize({ minX: -5, maxX: 35, minZ: -5, maxZ: 25 });
    expect(size).toEqual({ width: 40 * REGION_CHART_TEXELS_PER_UNIT, height: 30 * REGION_CHART_TEXELS_PER_UNIT, texelsPerUnit: REGION_CHART_TEXELS_PER_UNIT });
  });

  it("keeps a large map's chart within the size every WebGL2 device takes, at one density both ways", () => {
    const size = regionChartSize({ minX: 0, maxX: 75, minZ: -5, maxZ: 75 });
    expect(size.height).toBe(REGION_CHART_MAX_SIZE);
    expect(size.width).toBeLessThanOrEqual(REGION_CHART_MAX_SIZE);
    expect(size.width / 75).toBeCloseTo(size.height / 80, 1);
    expect(size.texelsPerUnit).toBeCloseTo(25.6, 5);
  });
});
