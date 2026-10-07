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
import { viewDirectionXZ } from "./sunDirection";
import { CAMERA_DIRECTION } from "../cameraBounds";

export const TRADE_WIND_SEA: WindSea = { windSpeed: 7, fetch: 100_000, peakEnhancement: 3.3 };

/**
 * Direction the wind blows toward, radians from +x toward +z. Placed relative
 * to the camera's view, like the sun (atmosphere.ts), so the sea keeps its
 * look when the camera turns (#36): away from the camera, swung 25° to
 * screen left, so the crests run across the screen and line up with neither
 * the hex rows nor the columns. (Tuned with the old diagonal view as "toward
 * −x, 0.35 rad off the axis", which is this swing from that view.)
 */
const WIND_SWING_FROM_VIEW = (-25 * Math.PI) / 180;
const [VIEW_X, VIEW_Z] = viewDirectionXZ(CAMERA_DIRECTION);
export const WIND_ANGLE = Math.atan2(VIEW_Z, VIEW_X) + WIND_SWING_FROM_VIEW;

export const WAVE_CASCADES: readonly WaveCascade[] = bandedCascades(TRADE_WIND_SEA, WIND_ANGLE, [
  { tileMetres: 1468, size: 256, rotation: 0.21, seed: 38 },
  { tileMetres: 202.5, size: 256, rotation: 0.73, seed: 381 },
  { tileMetres: 26.1, size: 256, rotation: 1.29, seed: 382 },
]);

/**
 * Choppiness λ (#38 step 7): how far the surface is pulled horizontally
 * toward the crests, as a multiple of Tessendorf's unit displacement. 1–1.5
 * is the usual range; the crests sharpen with it and so does the whitecap
 * coverage (whitecapFoam.ts). The same λ pulls the geometry (step 8,
 * waveDisplacement.ts), so the sharpened crests and the foam on them agree.
 */
export const WAVE_CHOPPINESS = 1.2;

/**
 * Indices into WAVE_CASCADES of the cascades that whitecap: the swell (lightly;
 * its crests are long and gentle) and the chop, where most of a moderate
 * sea's white horses come from. The ripple band's waves are too short to
 * break into foam that lasts, and would only add a tile of fine grain.
 */
export const WHITECAP_CASCADES: readonly number[] = [0, 1];

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
