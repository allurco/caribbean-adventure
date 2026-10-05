/**
 * The sea state the water shows (#38), and the FFT cascades that carry it.
 *
 * Trade-wind sea: a steady 7 m/s easterly (Beaufort 4, the Caribbean's
 * typical trade wind) over 100 km of open water. JONSWAP gives a 5.5 s peak
 * period, a ~48 m peak wavelength and a significant height of ~1.6 m: a
 * moderate sea with no breaking to speak of at map zoom.
 *
 * Three 256² cascades split its spectrum end to end (waveCascadeBands.ts):
 *
 * | Cascade | Tile            | Texel   | Band (wavelengths)  | Seen at          |
 * |---------|-----------------|---------|---------------------|------------------|
 * | swell   | 1468 m (22.6 u) | 5.7 m   | ∞ … 23 m (the peak) | every zoom       |
 * | chop    | 202.5 m (3.1 u) | 0.79 m  | 23 … 3.2 m          | every zoom       |
 * | ripple  | 26.1 m (0.40 u) | 0.10 m  | 3.2 … 0.41 m        | ship zoom only   |
 *
 * - The swell tile holds the peak and its upper flank (to 2.1 × the peak
 *   wavenumber) and is about as wide as the whole map-zoom view, so the large
 *   wave groups the eye follows barely repeat on screen (one 500 m tile used
 *   to repeat every 7.7 units).
 * - Neighbouring tiles differ by ~7.25× and ~7.76×, close to the most the
 *   bands allow while each finer band's low edge keeps eight modes across its
 *   tile. The ratios are picked so no three repeats of a larger tile line up
 *   with the smaller to within a fifth of a tile, and
 *   the tiles are turned well apart (waveCascade.ts `rotation`), so the
 *   repeats never share axes.
 * - The ripple band ends at waves two pixels long at the closest ship zoom.
 * - At map zoom (1.4–1.9 m per pixel) the ripple band's longest wave spans
 *   under two pixels, so it is faded out into roughness (waveNormalFilter.ts).
 *
 * Three 256² grids are three times the old single cascade's pixels, batched
 * into 20 draws a frame (useWaveCascades.ts). A 512² swell grid would double
 * its tile for the same texel at ~4.5× that cascade's cost, and would need
 * its own pass sequence; the 256² swell tile already spans the map-zoom
 * view, so it was not needed.
 */
import { coxMunkSlopeVariance } from "./seaSurfaceSlope";
import { resolvedSlopeVariance, type WaveCascade } from "./waveCascade";
import { bandedCascades } from "./waveCascadeBands";
import type { WindSea } from "./jonswap";

export const TRADE_WIND_SEA: WindSea = { windSpeed: 7, fetch: 100_000, peakEnhancement: 3.3 };

/** Toward −x, swung off the axis so crests never line up with the hex rows. */
const WIND_ANGLE = Math.PI + 0.35;

export const WAVE_CASCADES: readonly WaveCascade[] = bandedCascades(TRADE_WIND_SEA, WIND_ANGLE, [
  { tileMetres: 1468, size: 256, rotation: 0.21, seed: 38 },
  { tileMetres: 202.5, size: 256, rotation: 0.73, seed: 381 },
  { tileMetres: 26.1, size: 256, rotation: 1.29, seed: 382 },
]);

/** Mean square slope the cascades carry between them. */
const SHOWN_SLOPE_VARIANCE = WAVE_CASCADES.reduce((sum, c) => sum + resolvedSlopeVariance(c), 0);
const MEASURED_SLOPE_VARIANCE = coxMunkSlopeVariance(TRADE_WIND_SEA.windSpeed);

/**
 * STYLISTIC, physically motivated (#38): gain on the wave slopes that the sky
 * reflection and the refracted seabed see (not the glint). The cascades stop
 * at 0.4 m waves, short of the capillary ripples that carry the rest of the
 * mean square slope Cox–Munk measured for this wind. Scaling the drawn slopes
 * by √(measured / drawn) gives the visible pattern the real sea's slope
 * statistics, so the waves read in the sky reflection away from the sun, where
 * Fresnel at F0 = 0.02 otherwise leaves them at ~1% contrast.
 */
export const WAVE_SHADING_GAIN = Math.sqrt(MEASURED_SLOPE_VARIANCE / SHOWN_SLOPE_VARIANCE);

/**
 * STYLISTIC, NOT PHYSICS (#38): the share of the slope variance the cascades
 * do not carry (Cox–Munk's total minus theirs) that goes into the glint's
 * roughness. All of it spreads the sun into a broad, dim sheen under the bloom
 * threshold. A camera exposed for the water sees the glitter of sub-pixel
 * facets as a narrow path of saturated sparkles; keeping a tenth gives a
 * defined path whose sparkles bloom. The glint uses the drawn slopes without
 * WAVE_SHADING_GAIN, which keeps the path narrow.
 */
const GLINT_UNRESOLVED_SHARE = 0.1;

/** Glint roughness α² before the filtered and faded wave variance is added. */
export const GLINT_BASE_ROUGHNESS2 =
  GLINT_UNRESOLVED_SHARE * Math.max(0, MEASURED_SLOPE_VARIANCE - SHOWN_SLOPE_VARIANCE);
