import { describe, expect, it } from "vitest";
import { bandedCascades, type CascadeTile } from "./waveCascadeBands";
import { cascadeWavenumber, inCascadeBand, modeVariance, resolvedSlopeVariance } from "./waveCascade";
import { jonswapSpectrum } from "./jonswap";
import { GRAVITY, deepWaterFrequency } from "./waveDispersion";

const sea = { windSpeed: 7, fetch: 100_000, peakEnhancement: 3.3 };

const tiles: CascadeTile[] = [
  { tileMetres: 2000, size: 256, rotation: 0.3, seed: 1 },
  { tileMetres: 230, size: 256, rotation: 0.9, seed: 2 },
  { tileMetres: 31, size: 256, rotation: 1.4, seed: 3 },
];
const cascades = bandedCascades(sea, 0.5, tiles);

/** Σ E|h̃|² = Σ 2 E|h0|² over a cascade's grid: its height variance. */
function heightVariance(c: (typeof cascades)[number]): number {
  let total = 0;
  for (let z = 0; z < c.size; z++) {
    for (let x = 0; x < c.size; x++) {
      total += 2 * modeVariance(cascadeWavenumber(x, c.size, c.tileMetres), cascadeWavenumber(z, c.size, c.tileMetres), c);
    }
  }
  return total;
}

/** ∫ weight(ω) S(ω) dω from ω(kLow) to ω(kHigh): the continuous spectrum, independent of any grid. */
function spectrumIntegral(kLow: number, kHigh: number, weight: (omega: number) => number): number {
  const lo = deepWaterFrequency(kLow);
  const hi = deepWaterFrequency(kHigh);
  const n = 40000;
  const h = (hi - lo) / n;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const w = lo + (i + 0.5) * h;
    total += weight(w) * jonswapSpectrum(w, sea) * h;
  }
  return total;
}

describe("bandedCascades", () => {
  it("keeps each tile's grid, turn and seed, and the shared wind", () => {
    cascades.forEach((c, i) => {
      expect(c.tileMetres).toBe(tiles[i].tileMetres);
      expect(c.size).toBe(256);
      expect(c.rotation).toBe(tiles[i].rotation);
      expect(c.seed).toBe(tiles[i].seed);
      expect(c.windAngle).toBe(0.5);
      expect(c.sea).toBe(sea);
    });
  });

  it("ends each band where its shortest wave still spans four texels", () => {
    // Half the grid's Nyquist, π · 256 / tile · ½.
    expect(cascades[0].kMax).toBeCloseTo(0.20106, 5);
    expect(cascades[1].kMax).toBeCloseTo(1.74836, 5);
    expect(cascades[2].kMax).toBeCloseTo(12.97174, 5);
  });

  it("lays the bands end to end from the longest waves, with no gap and no overlap", () => {
    expect(cascades[0].kMin).toBe(0);
    expect(cascades[1].kMin).toBe(cascades[0].kMax);
    expect(cascades[2].kMin).toBe(cascades[1].kMax);
    for (let k = 0.001; k < cascades[2].kMax; k *= 1.01) {
      expect(cascades.filter((c) => inCascadeBand(k, c))).toHaveLength(1);
    }
  });

  it("carries the spectrum's height variance once across the three bands", () => {
    const total = cascades.reduce((sum, c) => sum + heightVariance(c), 0);
    const expected = spectrumIntegral(2 * Math.PI / tiles[0].tileMetres, cascades[2].kMax, () => 1);
    expect(total / expected).toBeCloseTo(1, 1);
  });

  it("carries the spectrum's slope variance once across the three bands", () => {
    // Mean square slope: ∫ k² S(ω) dω with k = ω² / g.
    const total = cascades.reduce((sum, c) => sum + resolvedSlopeVariance(c), 0);
    const expected = spectrumIntegral(2 * Math.PI / tiles[0].tileMetres, cascades[2].kMax, (w) => (w * w / GRAVITY) ** 2);
    expect(total / expected).toBeCloseTo(1, 1);
  });

  it("refuses tiles that would leave a band empty", () => {
    expect(() => bandedCascades(sea, 0, [tiles[1], tiles[0]])).toThrow();
    expect(() => bandedCascades(sea, 0, [tiles[0], { ...tiles[0], seed: 9 }])).toThrow();
  });
});
