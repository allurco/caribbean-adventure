/**
 * The sea state the water shows (#38), and the FFT cascade that carries it.
 *
 * Trade-wind sea: a steady 7 m/s easterly (Beaufort 4, the Caribbean's
 * typical trade wind) over 100 km of open water. JONSWAP gives a 5.5 s peak
 * period, a ~48 m peak wavelength and a significant height of ~1.6 m: a
 * moderate sea with no breaking to speak of at map zoom.
 *
 * Near cascade: 256² modes over a 500 m tile (7.7 world units), so a texel
 * is ~1.95 m. At full zoom-out (camera 28 units from its target, 45° field
 * of view) a 1080-px screen pixel covers about 1.4–1.9 m of sea, so the
 * shortest wave the grid holds (≈ 3.9 m, two texels) is about two pixels:
 * the cascade resolves what map zoom can show, and the mipmaps filter the rest
 * (waveNormalFilter.ts). The peak wave is ~10 times shorter than the tile, so
 * the spectrum is well sampled at the low end. One tile still repeats every
 * 7.7 units; step 5's further cascades with non-commensurate tiles hide that.
 */
import { coxMunkSlopeVariance } from "./seaSurfaceSlope";
import { nyquistWavenumber, resolvedSlopeVariance, type WaveCascade } from "./waveCascade";
import type { WindSea } from "./jonswap";

export const TRADE_WIND_SEA: WindSea = { windSpeed: 7, fetch: 100_000, peakEnhancement: 3.3 };

const NEAR_TILE_METRES = 500;
const NEAR_SIZE = 256;

export const NEAR_CASCADE: WaveCascade = {
  sea: TRADE_WIND_SEA,
  // Toward −x, swung off the axis so crests never line up with the hex rows.
  windAngle: Math.PI + 0.35,
  tileMetres: NEAR_TILE_METRES,
  size: NEAR_SIZE,
  kMin: 0,
  kMax: nyquistWavenumber(NEAR_SIZE, NEAR_TILE_METRES),
  seed: 38,
};

/**
 * STYLISTIC, NOT PHYSICS (#38): the share of the sub-grid slope variance
 * (Cox–Munk's total minus what the cascade resolves) that goes into the
 * glint's roughness. All of it (α² ≈ 0.03) spreads the sun into a broad, dim
 * sheen with peaks of about 0.15 in scene units, under the bloom threshold
 * and barely brighter than the water. A camera exposed for the water sees
 * the glitter of sub-pixel facets as a path of saturated sparkles; keeping a
 * quarter of it gives sparkles from the resolved waves bright enough to bloom.
 */
const GLINT_UNRESOLVED_SHARE = 0.25;

/** Glint roughness α² before the filtered wave variance is added. */
export const GLINT_BASE_ROUGHNESS2 =
  GLINT_UNRESOLVED_SHARE *
  Math.max(0, coxMunkSlopeVariance(TRADE_WIND_SEA.windSpeed) - resolvedSlopeVariance(NEAR_CASCADE));
