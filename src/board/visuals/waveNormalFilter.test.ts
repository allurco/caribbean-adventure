import { describe, expect, it } from "vitest";
import {
  WAVE_DETAIL_FADE_END,
  WAVE_DETAIL_FADE_START,
  fadedWaveSlope,
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

describe("fadedWaveSlope", () => {
  // A filtered texel: mean slope (0.1, −0.05), mean square slope 0.03.
  const mean = [0.1, -0.05] as const;
  const meanSquare = 0.03;

  it("keeps the mean slope at full detail; the variance is what the filtering averaged away", () => {
    const { slope, variance } = fadedWaveSlope(mean, meanSquare, 1);
    expect(slope).toEqual([0.1, -0.05]);
    expect(variance).toBeCloseTo(0.03 - 0.0125, 9);
  });

  it("flattens the surface when faded out and moves all the slope into roughness", () => {
    const { slope, variance } = fadedWaveSlope(mean, meanSquare, 0);
    expect(slope).toEqual([0, -0]);
    expect(variance).toBeCloseTo(0.03, 9);
  });

  it("conserves the total mean square slope at any fade", () => {
    const { slope, variance } = fadedWaveSlope(mean, meanSquare, 0.4);
    expect(slope[0] ** 2 + slope[1] ** 2 + variance).toBeCloseTo(meanSquare, 9);
  });

  it("never returns a negative variance from rounding in the texture", () => {
    expect(fadedWaveSlope([0.1, 0], 0.0099, 1).variance).toBe(0);
  });
});
