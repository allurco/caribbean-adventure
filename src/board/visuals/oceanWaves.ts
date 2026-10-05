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
import { DETAIL_LAYER_GAIN } from "./waveDetailLayer";

export const TRADE_WIND_SEA: WindSea = { windSpeed: 7, fetch: 100_000, peakEnhancement: 3.3 };

const NEAR_TILE_METRES = 500;
const NEAR_SIZE = 256;

export const NEAR_CASCADE: WaveCascade = {
  sea: TRADE_WIND_SEA,
  // Toward −x, swung off the axis so crests never line up with the hex rows.
  windAngle: Math.PI + 0.35,
  rotation: 0,
  tileMetres: NEAR_TILE_METRES,
  size: NEAR_SIZE,
  kMin: 0,
  kMax: nyquistWavenumber(NEAR_SIZE, NEAR_TILE_METRES),
  seed: 38,
};

/** Mean square slope the shader draws: the cascade plus its detail look-up (waveDetailLayer.ts). */
const SHOWN_SLOPE_VARIANCE = resolvedSlopeVariance(NEAR_CASCADE) * (1 + DETAIL_LAYER_GAIN ** 2);
const MEASURED_SLOPE_VARIANCE = coxMunkSlopeVariance(TRADE_WIND_SEA.windSpeed);

/**
 * STYLISTIC, physically motivated (#38): gain on the wave slopes that the sky
 * reflection and the refracted seabed see (not the glint). The two look-ups
 * draw only about a third of the mean square slope Cox–Munk measured for this
 * wind; the rest is in waves shorter than a texel. Scaling the drawn slopes
 * by √(measured / drawn) ≈ 1.7 gives the visible pattern the real sea's slope
 * statistics, so the waves read in the sky reflection away from the sun, where
 * Fresnel at F0 = 0.02 otherwise leaves them at ~1% contrast.
 */
export const WAVE_SHADING_GAIN = Math.sqrt(MEASURED_SLOPE_VARIANCE / SHOWN_SLOPE_VARIANCE);

/**
 * STYLISTIC, NOT PHYSICS (#38): the share of the slope variance the two
 * look-ups do not draw (Cox–Munk's total minus theirs) that goes into the
 * glint's roughness. All of it (α² ≈ 0.026) spreads the sun into a broad, dim
 * sheen with peaks of about 0.15 in scene units, under the bloom threshold.
 * A camera exposed for the water sees the glitter of sub-pixel facets as a
 * narrow path of saturated sparkles; keeping a tenth gives a defined path
 * whose sparkles bloom. The glint uses the drawn slopes without
 * WAVE_SHADING_GAIN, which keeps the path narrow.
 */
const GLINT_UNRESOLVED_SHARE = 0.1;

/** Glint roughness α² before the filtered wave variance is added. */
export const GLINT_BASE_ROUGHNESS2 =
  GLINT_UNRESOLVED_SHARE * Math.max(0, MEASURED_SLOPE_VARIANCE - SHOWN_SLOPE_VARIANCE);
