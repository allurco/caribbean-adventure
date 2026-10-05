import { describe, expect, it } from "vitest";
import { GLINT_BASE_ROUGHNESS2, NEAR_CASCADE, TRADE_WIND_SEA, WAVE_SHADING_GAIN } from "./oceanWaves";
import { DETAIL_LAYER_GAIN } from "./waveDetailLayer";
import { jonswapPeakFrequency, jonswapSpectrum } from "./jonswap";
import { nyquistWavenumber, resolvedSlopeVariance } from "./waveCascade";
import { coxMunkSlopeVariance } from "./seaSurfaceSlope";
import { GRAVITY } from "./waveDispersion";

describe("the trade-wind sea", () => {
  it("is a moderate sea of about 1.5 m significant height", () => {
    let m0 = 0;
    for (let w = 0.05; w < 30; w += 0.001) m0 += jonswapSpectrum(w, TRADE_WIND_SEA) * 0.001;
    const hs = 4 * Math.sqrt(m0);
    expect(hs).toBeGreaterThan(1);
    expect(hs).toBeLessThan(2);
  });

  it("has its peak wavelength well inside the near tile", () => {
    const wp = jonswapPeakFrequency(TRADE_WIND_SEA);
    const peakWavelength = (2 * Math.PI * GRAVITY) / (wp * wp);
    expect(NEAR_CASCADE.tileMetres / peakWavelength).toBeGreaterThan(5);
  });
});

describe("NEAR_CASCADE", () => {
  it("is 256² and carries every wave its grid can hold", () => {
    expect(NEAR_CASCADE.size).toBe(256);
    expect(NEAR_CASCADE.kMin).toBe(0);
    expect(NEAR_CASCADE.kMax).toBeCloseTo(nyquistWavenumber(256, NEAR_CASCADE.tileMetres), 12);
  });
});

describe("WAVE_SHADING_GAIN", () => {
  it("scales the shown slopes up to Cox–Munk's measured mean square slope", () => {
    const shown = resolvedSlopeVariance(NEAR_CASCADE) * (1 + DETAIL_LAYER_GAIN ** 2);
    expect(WAVE_SHADING_GAIN ** 2 * shown).toBeCloseTo(coxMunkSlopeVariance(TRADE_WIND_SEA.windSpeed), 9);
  });

  it("is a moderate boost, not a distortion", () => {
    expect(WAVE_SHADING_GAIN).toBeGreaterThan(1);
    expect(WAVE_SHADING_GAIN).toBeLessThan(2.5);
  });
});

describe("GLINT_BASE_ROUGHNESS2", () => {
  it("is positive and below the slope variance Cox–Munk leaves over after both layers", () => {
    const shown = resolvedSlopeVariance(NEAR_CASCADE) * (1 + DETAIL_LAYER_GAIN ** 2);
    const leftOver = coxMunkSlopeVariance(TRADE_WIND_SEA.windSpeed) - shown;
    expect(GLINT_BASE_ROUGHNESS2).toBeGreaterThan(0);
    expect(GLINT_BASE_ROUGHNESS2).toBeLessThanOrEqual(leftOver);
  });
});
