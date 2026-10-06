import { describe, expect, it } from "vitest";
import {
  BEACH_WASH_EBB,
  BEACH_WASH_FLOOD,
  BEACH_WASH_WATERSIDE_FADE,
  beachWashBand,
  BREAKER_INDEX,
  BREAKING_DEPTH_METRES,
  breakerBand,
  breakingDepth,
  REEF_WINDWARD_BIAS,
  reefFoamBand,
  reefWindwardWeight,
  SHORE_FOAM_GLSL,
  WASH_DEPTH_EBB,
  WASH_DEPTH_FLOOD,
  washBand,
  WIND_TOWARD,
} from "./shoreFoam";
import { jonswapSignificantHeight } from "./jonswap";
import { TRADE_WIND_SEA, WIND_ANGLE } from "./oceanWaves";

describe("jonswapSignificantHeight", () => {
  it("gives the trade-wind sea a moderate significant height, about 1.6 m", () => {
    const hs = jonswapSignificantHeight(TRADE_WIND_SEA);
    expect(hs).toBeGreaterThan(1.4);
    expect(hs).toBeLessThan(1.8);
  });

  it("grows with the wind and with the fetch", () => {
    expect(jonswapSignificantHeight({ ...TRADE_WIND_SEA, windSpeed: 10 })).toBeGreaterThan(jonswapSignificantHeight(TRADE_WIND_SEA));
    expect(jonswapSignificantHeight({ ...TRADE_WIND_SEA, fetch: 200_000 })).toBeGreaterThan(jonswapSignificantHeight(TRADE_WIND_SEA));
  });
});

describe("breakingDepth", () => {
  it("is the height over McCowan's breaker index, 0.78", () => {
    expect(BREAKER_INDEX).toBe(0.78);
    expect(breakingDepth(0.78)).toBeCloseTo(1, 12);
    expect(breakingDepth(1.6)).toBeCloseTo(2.05, 2);
  });

  it("puts the trade-wind sea's breaker line about 2 m down", () => {
    expect(BREAKING_DEPTH_METRES).toBeGreaterThan(1.8);
    expect(BREAKING_DEPTH_METRES).toBeLessThan(2.3);
    expect(BREAKING_DEPTH_METRES).toBeCloseTo(breakingDepth(jonswapSignificantHeight(TRADE_WIND_SEA)), 12);
  });
});

describe("breakerBand", () => {
  it("peaks on the breaking-depth contour and fades either side", () => {
    expect(breakerBand(2, 2)).toBe(1);
    expect(breakerBand(2.4, 2)).toBeGreaterThan(0);
    expect(breakerBand(2.4, 2)).toBeLessThan(1);
    expect(breakerBand(1.6, 2)).toBeGreaterThan(0);
    expect(breakerBand(4, 2)).toBe(0);
    expect(breakerBand(0, 2)).toBe(0);
  });

  it("lasts further shoreward (the broken bore runs on) than seaward", () => {
    expect(breakerBand(2 - 0.7, 2)).toBeGreaterThan(breakerBand(2 + 0.7, 2));
  });

  it("falls steadily away from the contour", () => {
    let previous = 1;
    for (let d = 2; d <= 5; d += 0.05) {
      const b = breakerBand(d, 2);
      expect(b).toBeLessThanOrEqual(previous + 1e-12);
      previous = b;
    }
  });
});

describe("washBand", () => {
  it("is full at the waterline and gone past the flood depth", () => {
    expect(washBand(0, 0)).toBe(1);
    expect(washBand(0, 1)).toBe(1);
    expect(washBand(WASH_DEPTH_FLOOD, 1)).toBe(0);
    expect(washBand(WASH_DEPTH_EBB, 0)).toBe(0);
  });

  it("reaches deeper at the flood of the pulse than at the ebb", () => {
    const depth = (WASH_DEPTH_EBB + WASH_DEPTH_FLOOD) / 2;
    expect(washBand(depth, 1)).toBeGreaterThan(washBand(depth, 0));
    expect(WASH_DEPTH_FLOOD).toBeGreaterThan(WASH_DEPTH_EBB);
    expect(WASH_DEPTH_EBB).toBeGreaterThan(0);
  });
});

describe("beachWashBand (the wash on the sand, drawn by the land, #38 step 7)", () => {
  it("is full at the waterline and gone past the flood reach up the beach", () => {
    expect(beachWashBand(0, 0)).toBe(1);
    expect(beachWashBand(0, 1)).toBe(1);
    expect(beachWashBand(BEACH_WASH_FLOOD, 1)).toBe(0);
    expect(beachWashBand(BEACH_WASH_EBB, 0)).toBe(0);
  });

  it("draws nothing on the water side, where the field may be reading water under land mesh", () => {
    for (const pulse of [0, 0.5, 1]) {
      expect(beachWashBand(-0.5, pulse)).toBe(0);
      expect(beachWashBand(-BEACH_WASH_WATERSIDE_FADE, pulse)).toBe(0);
      expect(beachWashBand(-5, pulse)).toBe(0);
    }
  });

  it("fades in over a fraction of a field texel just inside the waterline, so the gate has no hard edge", () => {
    expect(BEACH_WASH_WATERSIDE_FADE).toBeGreaterThan(0);
    expect(BEACH_WASH_WATERSIDE_FADE).toBeLessThan(1 / 12); // one texel at 12 texels per unit
    const half = beachWashBand(-BEACH_WASH_WATERSIDE_FADE / 2, 0);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    let previous = 0;
    for (let c = -BEACH_WASH_WATERSIDE_FADE; c <= 0; c += BEACH_WASH_WATERSIDE_FADE / 20) {
      const band = beachWashBand(c, 0);
      expect(band).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = band;
    }
  });

  it("leaves the band on the sand itself as it was: solid near the waterline, then fading to the reach", () => {
    const reach = BEACH_WASH_EBB;
    expect(beachWashBand(reach * 0.3, 0)).toBe(1);
    expect(beachWashBand(reach * 0.35, 0)).toBe(1);
    const mid = beachWashBand(reach * 0.7, 0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(beachWashBand(reach, 0)).toBe(0);
  });

  it("runs further up the sand at the flood than at the ebb", () => {
    const up = (BEACH_WASH_EBB + BEACH_WASH_FLOOD) / 2;
    expect(beachWashBand(up, 1)).toBeGreaterThan(beachWashBand(up, 0));
    expect(BEACH_WASH_FLOOD).toBeGreaterThan(BEACH_WASH_EBB);
    // A few metres of beach, in world units (65 m each).
    expect(BEACH_WASH_FLOOD * 65).toBeGreaterThan(3);
    expect(BEACH_WASH_FLOOD * 65).toBeLessThan(10);
  });
});

describe("reefFoamBand", () => {
  it("foams a reef crest in the first few metres and not a reef hex's deeper floor", () => {
    expect(reefFoamBand(1)).toBe(1);
    expect(reefFoamBand(2.5)).toBe(1);
    expect(reefFoamBand(10)).toBe(0);
    expect(reefFoamBand(3.5)).toBeGreaterThan(0);
    expect(reefFoamBand(3.5)).toBeLessThan(1);
  });
});

describe("reefWindwardWeight", () => {
  const wind: [number, number] = [1, 0]; // blowing toward +x

  it("is 1 on the face that meets the wind and least in its lee", () => {
    expect(reefWindwardWeight([-1, 0], wind)).toBeCloseTo(1, 12);
    expect(reefWindwardWeight([1, 0], wind)).toBeCloseTo((1 - REEF_WINDWARD_BIAS) / (1 + REEF_WINDWARD_BIAS), 12);
    expect(reefWindwardWeight([1, 0], wind)).toBeGreaterThan(0);
  });

  it("is in between on a flank and for a point with no outward face (inside a wide reef)", () => {
    const flank = reefWindwardWeight([0, 1], wind);
    const inside = reefWindwardWeight([0, 0], wind);
    expect(flank).toBeCloseTo(inside, 12);
    expect(inside).toBeLessThan(1);
    expect(inside).toBeGreaterThan(reefWindwardWeight([1, 0], wind));
  });

  it("uses the trade wind's direction by default", () => {
    expect(WIND_TOWARD[0]).toBeCloseTo(Math.cos(WIND_ANGLE), 12);
    expect(WIND_TOWARD[1]).toBeCloseTo(Math.sin(WIND_ANGLE), 12);
    expect(reefWindwardWeight([-WIND_TOWARD[0], -WIND_TOWARD[1]])).toBeCloseTo(1, 12);
  });
});

describe("SHORE_FOAM_GLSL", () => {
  it("mirrors the breaking depth, the bands and the reef band", () => {
    expect(SHORE_FOAM_GLSL).toContain(`const float BREAKING_DEPTH_METRES = ${BREAKING_DEPTH_METRES.toFixed(4)};`);
    expect(SHORE_FOAM_GLSL).toContain("float breakerBand(float depthMetres, float breakingDepthMetres)");
    expect(SHORE_FOAM_GLSL).toContain("float washBand(float depthMetres, float pulse)");
    expect(SHORE_FOAM_GLSL).toContain("float reefFoamBand(float depthMetres)");
    expect(SHORE_FOAM_GLSL).toContain("float beachWashBand(float coastDistance, float pulse)");
  });

  it("gates the beach wash on the water side the same way as the TypeScript", () => {
    expect(SHORE_FOAM_GLSL).toContain(`const float BEACH_WASH_WATERSIDE_FADE = ${BEACH_WASH_WATERSIDE_FADE.toFixed(4)};`);
    expect(SHORE_FOAM_GLSL).toContain("return upTheBeach * smoothstep(-BEACH_WASH_WATERSIDE_FADE, 0.0, coastDistance);");
  });
});
