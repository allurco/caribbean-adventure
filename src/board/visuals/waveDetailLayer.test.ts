import { describe, expect, it } from "vitest";
import {
  DETAIL_LAYER_GAIN,
  DETAIL_LAYER_ROTATION,
  DETAIL_LAYER_SCALE,
  combineSlopeLayers,
  detailLayerUv,
} from "./waveDetailLayer";

describe("detail layer placement", () => {
  it("repeats at a scale that never lines up with the main tile", () => {
    // Non-commensurate: no small whole-number ratio within 2%.
    for (let q = 1; q <= 6; q++) {
      const p = DETAIL_LAYER_SCALE * q;
      expect(Math.abs(p - Math.round(p))).toBeGreaterThan(0.02 * q);
    }
  });

  it("is turned well away from the main tile's axes", () => {
    const turn = DETAIL_LAYER_ROTATION % (Math.PI / 2);
    expect(turn).toBeGreaterThan(0.2);
    expect(turn).toBeLessThan(Math.PI / 2 - 0.2);
  });

  it("maps main-tile uv to scaled, rotated detail uv", () => {
    const [u, v] = detailLayerUv([1, 0]);
    expect(Math.hypot(u, v)).toBeCloseTo(DETAIL_LAYER_SCALE, 9);
    expect(Math.atan2(v, u)).toBeCloseTo(DETAIL_LAYER_ROTATION, 9);
  });
});

describe("combineSlopeLayers", () => {
  const main = { mean: [0.05, -0.02] as const, meanSquare: 0.01 };
  const zero = { mean: [0, 0] as const, meanSquare: 0 };

  it("passes the main layer through when the detail is still", () => {
    const c = combineSlopeLayers(main, zero);
    expect(c.mean[0]).toBeCloseTo(0.05, 12);
    expect(c.mean[1]).toBeCloseTo(-0.02, 12);
    expect(c.meanSquare).toBeCloseTo(0.01, 12);
  });

  it("turns the detail slope back into world axes and scales it by the gain", () => {
    // h(u) = 0.1·u₁ sampled at u = R·x is 0.1·(cos θ·x − sin θ·z): gradient 0.1·(cos θ, −sin θ).
    const c = combineSlopeLayers(zero, { mean: [0.1, 0], meanSquare: 0.01 });
    const g = DETAIL_LAYER_GAIN;
    expect(c.mean[0]).toBeCloseTo(0.1 * g * Math.cos(DETAIL_LAYER_ROTATION), 12);
    expect(c.mean[1]).toBeCloseTo(-0.1 * g * Math.sin(DETAIL_LAYER_ROTATION), 12);
  });

  it("adds the two layers' variances (independent waves)", () => {
    const detail = { mean: [0.03, 0.01] as const, meanSquare: 0.004 };
    const c = combineSlopeLayers(main, detail);
    const g = DETAIL_LAYER_GAIN;
    const varMain = 0.01 - (0.05 ** 2 + 0.02 ** 2);
    const varDetail = g * g * (0.004 - (0.03 ** 2 + 0.01 ** 2));
    const meanSq = c.mean[0] ** 2 + c.mean[1] ** 2;
    expect(c.meanSquare - meanSq).toBeCloseTo(varMain + varDetail, 12);
  });
});
