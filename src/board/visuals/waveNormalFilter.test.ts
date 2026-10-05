import { describe, expect, it } from "vitest";
import {
  WAVE_DETAIL_FADE_END,
  WAVE_DETAIL_FADE_START,
  cascadeLodFade,
  combineCascadeSlopes,
  waveDetailFade,
} from "./waveNormalFilter";

describe("waveDetailFade", () => {
  it("keeps full detail up to the fade start and none past the end", () => {
    expect(waveDetailFade(0)).toBe(1);
    expect(waveDetailFade(WAVE_DETAIL_FADE_START)).toBe(1);
    expect(waveDetailFade(WAVE_DETAIL_FADE_END)).toBe(0);
    expect(waveDetailFade(WAVE_DETAIL_FADE_END * 3)).toBe(0);
  });

  it("falls steadily in between", () => {
    const mid = (WAVE_DETAIL_FADE_START + WAVE_DETAIL_FADE_END) / 2;
    expect(waveDetailFade(mid)).toBeCloseTo(0.5, 6);
    expect(waveDetailFade(mid + 1)).toBeLessThan(waveDetailFade(mid));
  });

  it("keeps the play area sharp at full zoom-out (camera 28 units from its target)", () => {
    // The top of the screen is ~45 units from the camera at full zoom-out.
    expect(WAVE_DETAIL_FADE_START).toBeGreaterThanOrEqual(45);
  });
});

describe("cascadeLodFade", () => {
  // A band whose longest wave is 2π / kMin = 10 m.
  const kMin = (2 * Math.PI) / 10;

  it("keeps a band whole while its longest wave spans four pixels or more", () => {
    expect(cascadeLodFade(1, kMin)).toBe(1);
    expect(cascadeLodFade(2.5, kMin)).toBe(1);
  });

  it("drops a band once its longest wave spans two pixels or fewer", () => {
    expect(cascadeLodFade(5, kMin)).toBe(0);
    expect(cascadeLodFade(40, kMin)).toBe(0);
  });

  it("falls steadily in between", () => {
    expect(cascadeLodFade(3, kMin)).toBeGreaterThan(cascadeLodFade(4, kMin));
    expect(cascadeLodFade(3, kMin)).toBeGreaterThan(0);
    expect(cascadeLodFade(3, kMin)).toBeLessThan(1);
  });

  it("never fades the band that starts at the longest waves", () => {
    expect(cascadeLodFade(1000, 0)).toBe(1);
  });
});

describe("combineCascadeSlopes", () => {
  // A filtered texel: mean slope (0.1, −0.05), mean square slope 0.03.
  const texel = { mean: [0.1, -0.05] as const, meanSquare: 0.03, rotation: 0 };

  it("keeps the mean slope at full detail; the variance is what the filtering averaged away", () => {
    const { slope, variance } = combineCascadeSlopes([{ ...texel, fade: 1 }]);
    expect(slope[0]).toBeCloseTo(0.1, 12);
    expect(slope[1]).toBeCloseTo(-0.05, 12);
    expect(variance).toBeCloseTo(0.03 - 0.0125, 9);
  });

  it("flattens a faded-out cascade and moves all its slope into roughness", () => {
    const { slope, variance } = combineCascadeSlopes([{ ...texel, fade: 0 }]);
    expect(Math.hypot(slope[0], slope[1])).toBe(0);
    expect(variance).toBeCloseTo(0.03, 9);
  });

  it("conserves a cascade's mean square slope at any fade", () => {
    const { slope, variance } = combineCascadeSlopes([{ ...texel, fade: 0.4 }]);
    expect(slope[0] ** 2 + slope[1] ** 2 + variance).toBeCloseTo(0.03, 9);
  });

  it("turns a cascade's slope from its tile's axes back into the world's", () => {
    // A tile turned a quarter (its x along world +z): a slope along the tile's
    // x is a slope along world z.
    const { slope } = combineCascadeSlopes([{ mean: [0.1, 0], meanSquare: 0.01, rotation: Math.PI / 2, fade: 1 }]);
    expect(slope[0]).toBeCloseTo(0, 12);
    expect(slope[1]).toBeCloseTo(0.1, 12);
  });

  it("adds independent cascades in mean and in variance", () => {
    const a = { mean: [0.1, 0] as const, meanSquare: 0.02, rotation: 0, fade: 1 };
    const b = { mean: [0, 0.05] as const, meanSquare: 0.01, rotation: 0, fade: 0 };
    const { slope, variance } = combineCascadeSlopes([a, b]);
    expect(slope[0]).toBeCloseTo(0.1, 12);
    expect(slope[1]).toBeCloseTo(0, 12);
    expect(variance).toBeCloseTo(0.01 + 0.01, 9);
  });

  it("never returns a negative variance from rounding in the texture", () => {
    expect(combineCascadeSlopes([{ mean: [0.1, 0], meanSquare: 0.0099, rotation: 0, fade: 1 }]).variance).toBe(0);
  });
});
