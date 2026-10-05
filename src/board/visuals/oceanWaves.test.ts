import { describe, expect, it } from "vitest";
import { GLINT_BASE_ROUGHNESS2, TRADE_WIND_SEA, WAVE_CASCADES, WAVE_SHADING_GAIN } from "./oceanWaves";
import { jonswapPeakFrequency, jonswapSpectrum } from "./jonswap";
import { resolvedSlopeVariance } from "./waveCascade";
import { coxMunkSlopeVariance } from "./seaSurfaceSlope";
import { GRAVITY } from "./waveDispersion";
import { METRES_PER_UNIT } from "./worldScale";

const peakWavenumber = jonswapPeakFrequency(TRADE_WIND_SEA) ** 2 / GRAVITY;
const shownSlopeVariance = WAVE_CASCADES.reduce((sum, c) => sum + resolvedSlopeVariance(c), 0);
const [swell, chop, ripple] = WAVE_CASCADES;

describe("the trade-wind sea", () => {
  it("is a moderate sea of about 1.5 m significant height", () => {
    let m0 = 0;
    for (let w = 0.05; w < 30; w += 0.001) m0 += jonswapSpectrum(w, TRADE_WIND_SEA) * 0.001;
    const hs = 4 * Math.sqrt(m0);
    expect(hs).toBeGreaterThan(1);
    expect(hs).toBeLessThan(2);
  });
});

describe("WAVE_CASCADES", () => {
  it("is three 256² cascades, largest tile first", () => {
    expect(WAVE_CASCADES).toHaveLength(3);
    for (const c of WAVE_CASCADES) expect(c.size).toBe(256);
    expect(swell.tileMetres).toBeGreaterThan(chop.tileMetres);
    expect(chop.tileMetres).toBeGreaterThan(ripple.tileMetres);
  });

  it("repeats the swell less than once across the map-zoom view (the old tile repeated every 7.7 units)", () => {
    expect(swell.tileMetres / METRES_PER_UNIT).toBeGreaterThan(20);
  });

  it("holds the spectral peak and its upper flank in the swell cascade, well clear of its tile", () => {
    expect(swell.kMax).toBeGreaterThan(2 * peakWavenumber);
    // At least ten peak waves per tile, so the peak is finely sampled.
    expect(swell.tileMetres * peakWavenumber / (2 * Math.PI)).toBeGreaterThan(10);
  });

  it("samples the low edge of each finer band with at least eight modes", () => {
    for (const c of [chop, ripple]) {
      expect(c.kMin * c.tileMetres / (2 * Math.PI)).toBeGreaterThanOrEqual(8);
    }
  });

  it("reaches waves two pixels long at the closest ship zoom", () => {
    // Small map, closest zoom: the camera is ~4.3 units (280 m) from its
    // target, so a 1080-px, 45° view covers 0.21 m per pixel there.
    expect(ripple.kMax).toBeGreaterThanOrEqual((2 * Math.PI) / (2 * 0.21));
  });

  it("uses tile sizes that do not line up within three repeats of the larger one", () => {
    // m tiles of the larger one stay at least 15% of the smaller tile away
    // from any whole number of the smaller tiles, for m = 1, 2, 3.
    for (let a = 0; a < 3; a++) {
      for (let b = a + 1; b < 3; b++) {
        const ratio = WAVE_CASCADES[a].tileMetres / WAVE_CASCADES[b].tileMetres;
        for (let m = 1; m <= 3; m++) {
          expect(Math.abs(m * ratio - Math.round(m * ratio))).toBeGreaterThan(0.15);
        }
      }
    }
  });

  it("turns the tiles well apart, so their repeats never share axes", () => {
    const quarter = Math.PI / 2;
    for (let a = 0; a < 3; a++) {
      for (let b = a + 1; b < 3; b++) {
        const d = Math.abs(WAVE_CASCADES[a].rotation - WAVE_CASCADES[b].rotation) % quarter;
        expect(Math.min(d, quarter - d)).toBeGreaterThan(0.4);
      }
    }
  });

  it("blows the same wind through every cascade, each with its own random phases", () => {
    for (const c of WAVE_CASCADES) expect(c.windAngle).toBe(swell.windAngle);
    expect(new Set(WAVE_CASCADES.map((c) => c.seed)).size).toBe(3);
  });
});

describe("WAVE_SHADING_GAIN", () => {
  it("scales the shown slopes up to Cox–Munk's measured mean square slope", () => {
    expect(WAVE_SHADING_GAIN ** 2 * shownSlopeVariance).toBeCloseTo(coxMunkSlopeVariance(TRADE_WIND_SEA.windSpeed), 9);
  });

  it("is a moderate boost, not a distortion", () => {
    expect(WAVE_SHADING_GAIN).toBeGreaterThan(1);
    expect(WAVE_SHADING_GAIN).toBeLessThan(2.5);
  });
});

describe("GLINT_BASE_ROUGHNESS2", () => {
  it("is positive and below the slope variance Cox–Munk leaves over after the cascades", () => {
    const leftOver = coxMunkSlopeVariance(TRADE_WIND_SEA.windSpeed) - shownSlopeVariance;
    expect(GLINT_BASE_ROUGHNESS2).toBeGreaterThan(0);
    expect(GLINT_BASE_ROUGHNESS2).toBeLessThanOrEqual(leftOver);
  });
});
