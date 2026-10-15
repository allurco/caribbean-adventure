import { describe, it, expect } from "vitest";
import { inkedSea, regionChartSize, REGION_NAME_INK, REGION_CHART_MAX_SIZE, REGION_CHART_TEXELS_PER_UNIT } from "./regionChart";

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

describe("inkedSea: the ink printed over what the sea shows (#239)", () => {
  const body = [0.02, 0.08, 0.16] as const;
  const sky = [0.7, 0.75, 0.8] as const;
  const noGlint = [0, 0, 0] as const;

  it("darkens a sea that shows only the sky's reflection", () => {
    const [r, g, b] = inkedSea(body, sky, noGlint, 1, 0.42);
    expect(r).toBeLessThan(0.7 * 0.9);
    expect(g).toBeLessThan(0.75 * 0.9);
    expect(b).toBeLessThan(0.8 * 0.9);
  });

  it("leaves the sea as it is where there is no ink (ship zoom, off the names)", () => {
    const [r, g, b] = inkedSea(body, sky, noGlint, 0.6, 0);
    expect(r).toBeCloseTo(0.02 * 0.4 + 0.7 * 0.6, 10);
    expect(g).toBeCloseTo(0.08 * 0.4 + 0.75 * 0.6, 10);
    expect(b).toBeCloseTo(0.16 * 0.4 + 0.8 * 0.6, 10);
  });

  it("only ever darkens, more with more ink, at every Fresnel split", () => {
    for (const fresnel of [0, 0.3, 0.7, 1]) {
      let previous = inkedSea(body, sky, noGlint, fresnel, 0);
      for (const ink of [0.1, 0.3, 0.42, 0.7, 1]) {
        const now = inkedSea(body, sky, noGlint, fresnel, ink);
        now.forEach((c, i) => expect(c).toBeLessThan(previous[i]));
        previous = now;
      }
    }
  });

  it("prints as deeper, bluer water, not black, at the names' full strength", () => {
    const grey = [0.5, 0.5, 0.5] as const;
    const [r, g, b] = inkedSea(grey, grey, noGlint, 0.5, REGION_NAME_INK);
    for (const c of [r, g, b]) expect(c).toBeGreaterThan(0.5 * 0.15);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });


  it("darkens the sun's glint too, so a name in the sun's path still reads", () => {
    const glint = [4, 3.6, 3] as const;
    const plain = inkedSea(body, sky, glint, 0.1, 0);
    const inked = inkedSea(body, sky, glint, 0.1, 0.9);
    inked.forEach((c, i) => expect(c).toBeLessThan(plain[i] * 0.4));
  });
});

describe("inkedSea keeps the sea finite whatever the glint does", () => {
  const body = [0.02, 0.08, 0.16] as const;
  const sky = [0.7, 0.75, 0.8] as const;

  it("an infinite glint, under ink or not, gives a finite sea", () => {
    for (const ink of [0, 0.5, 1]) {
      for (const c of inkedSea(body, sky, [Infinity, Infinity, Infinity], 0.2, ink)) expect(Number.isFinite(c)).toBe(true);
    }
  });

  it("a NaN glint adds nothing rather than turning the sea NaN", () => {
    const plain = inkedSea(body, sky, [0, 0, 0], 0.2, 0.5);
    expect(inkedSea(body, sky, [NaN, 1, 1], 0.2, 0.5)).toEqual(plain);
  });
});
