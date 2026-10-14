/**
 * The scene's light-independent settings: what the sea bounces back into the
 * sky map, and how the sun's shadow map is sized, placed and filtered.
 *
 * The light itself (sun, fill, sky, haze, exposure, grade, bloom, vignette)
 * is not here: it all comes from `lightingFor(timeOfDay)` in lighting.ts
 * (#169), and nothing else holds a lighting value.
 */

import { PCFShadowMap } from "three";
import { CAMERA_FOV, CAMERA_PITCH } from "../cameraBounds";
import type { SunShadowSettings } from "../shadowFit";
import type { DirectionalLighting } from "./lighting";
import { downwardViewFactor, seaBounceAlbedo } from "./skyEnvironment";
import { ELEVATION_HEIGHTS, RELIEF_AMPLITUDES } from "./terrainHeightField";
import { SEABED_FADE_END } from "./waterOptics";
import { metresToUnits } from "./worldScale";

/**
 * Diffuse reflectance of the sea, which lights the scene from below.
 *
 * What lights an island slope from below is the water at its foot, and that
 * is mostly turquoise shallows over sand, not open ocean:
 * - Deep water reflects about 6% (Payne 1972), slightly green-blue.
 * - Clear water a few metres deep over white carbonate sand reflects about
 *   0.2–0.3 in the green and blue, but much less in the red, which water
 *   absorbs within a few metres (Maritorena et al. 1994, bottom-reflectance
 *   model).
 * - A slope point about 0.5 u (≈ 33 m) up, with shallows reaching about 0.5 u
 *   (≈ 33 m) out from the waterline (the turquoise bands in Ocean.tsx run
 *   0.4–0.7 u), sees the shallows fill R²/(R² + h²) = 0.5 of its downward view.
 */
const SHALLOW_SEA_ALBEDO = [0.12, 0.3, 0.3] as const;
const DEEP_SEA_ALBEDO = [0.04, 0.07, 0.08] as const;
const BOUNCE_SLOPE_HEIGHT = 0.5;
const SHALLOWS_REACH = 0.5;
export const SEA_BOUNCE_ALBEDO = seaBounceAlbedo(
  SHALLOW_SEA_ALBEDO,
  DEEP_SEA_ALBEDO,
  downwardViewFactor(BOUNCE_SLOPE_HEIGHT, SHALLOWS_REACH)
);

/**
 * Shadow filter. three 0.182 has deprecated `PCFSoftShadowMap` and silently
 * runs `PCFShadowMap` in its place (with a console warning), so this is what
 * the scene has been drawn with: five Vogel-disc samples per pixel, each a
 * hardware 4-tap compare, rotated per pixel by interleaved gradient noise,
 * within `SHADOW_RADIUS` texels. `VSMShadowMap` (blurs the map itself, so its
 * penumbra is smooth at any width) is the alternative: it needs every
 * receiver to cast too and leaks light where casters overlap (palms over
 * slopes, rigging over hulls), and has not been judged on screen yet (#48).
 * To try it: `VSMShadowMap`, `SHADOW_RADIUS` 4, `blurSamples` 8, biases 0.
 */
export const SHADOW_MAP_TYPE = PCFShadowMap;
/** PCF sample disc radius, shadow texels. 1 is three's default. */
export const SHADOW_RADIUS = 1;

/**
 * Shadow map resolution and the half-width of the shadow camera's box.
 *
 * The box follows the camera target and is fitted to the view (#48,
 * `shadowFit.ts`): its half-extent covers the furthest visible point of the
 * sea plane plus a margin for receivers above it, and the furthest visible
 * point of the deepest visible seabed (SHADOW_RECEIVER_DEPTH) plus a margin
 * for that depth, whichever is larger, clamped to [SHADOW_EXTENT_MIN,
 * SHADOW_EXTENT]. At full zoom-out (distance 28) the 16:9 view reaches ~43
 * units across the sea, so the box sits at the cap, 50 units across at 4096
 * texels: ~82 texels per world unit, a 0.8 m texel. At ship zoom (distance
 * ~3.5) the seabed term fits it to ~10.2 units, a 0.32 m texel, 2.5× finer
 * than the fixed box gave (the seabed, 1.46 units down, is hit ~4 units
 * beyond the sea along the far corner ray, which descends at only ~24°).
 * The cap is where today's resolution comes from, so the map stays at 4096:
 * at 2048 the map-zoom texel would double.
 *
 * Under the golden-hour sun (22°, #169) the box is fitted side by side
 * (`shadowBoxFor`): the width across the sun stays the view's reach, and the
 * height along it shrinks by sin(elevation), so the 3.5× longer shadows keep
 * about the ground texel the square box gave a 55° sun, instead of 2.7×
 * coarser down their length.
 */
export const SHADOW_MAP_SIZE = 4096;
export const SHADOW_EXTENT = 25;
/** Floor for the fit, so the box never collapses if the camera gets very close. */
export const SHADOW_EXTENT_MIN = 4;
/**
 * Tallest receiver or caster above the sea: a mountain peak with its relief
 * (ELEVATION_HEIGHTS[3] + RELIEF_AMPLITUDES[3] = 1.9) plus a tall palm
 * (trunk 0.46 × 1.25 height variation ≈ 0.6 with fronds) on top. Ship masts
 * and rocks are lower.
 */
export const SHADOW_CASTER_HEIGHT = ELEVATION_HEIGHTS[3] + RELIEF_AMPLITUDES[3] + 0.7;
/**
 * Deepest receiver below the sea whose shadow can be seen: the depth where
 * the water shader has fully faded the seabed out (SEABED_FADE_END, 95 m,
 * ~1.46 units). The seabed receives shadows through the water, but below
 * this nothing of it reaches the surface (the seabed mesh itself stops even
 * shallower, at VISIBLE_SEABED_DEPTH), so fitting the box to the floor
 * (~1.9 units) would cover shadows no one can see and cost ship-zoom texels,
 * the point of #48. The partly faded seabed between the fade start and end
 * is covered.
 */
export const SHADOW_RECEIVER_DEPTH = metresToUnits(SEABED_FADE_END);
/**
 * Growing refits at once (the box must cover the view); the box only shrinks
 * once the fitted extent has fallen this fraction of the current one below
 * it. A wheel tick zooms 5% but moves the extent by less (the caster margin
 * does not zoom), so zooming in shrinks the box about every second tick and
 * the damping between ticks does not re-snap the texel grid.
 */
export const SHADOW_FIT_HYSTERESIS = 0.05;
/**
 * Shadow camera depth planes along the sun, world units. From the sun 70
 * units out, a box 25 units high under the 22° golden-hour sun spans the
 * scene (seabed floor −1.9 to SHADOW_CASTER_HEIGHT) over about 1…137
 * (`shadowDepthRange`, checked in atmosphere.test.ts for the golden-hour and
 * midday suns; a day/night cycle must recheck its low suns, #187); three's
 * 24-bit depth makes the slack free.
 */
export const SHADOW_CAMERA_NEAR = 0.5;
export const SHADOW_CAMERA_FAR = 150;
/**
 * Biases in shadow texels, so they scale with the fitted box: three's `bias`
 * is in depth units and `normalBias` in world units, and the self-shadowing
 * error they cover is a texel's worth of slope. The fixed box ran bias
 * −0.0001 and normal bias 0.02 at a 0.0122-unit texel: 1.2 and 1.6 texels.
 * These reproduce that at map zoom and shrink in step with the texel.
 */
export const SHADOW_BIAS_TEXELS = 1.2;
export const SHADOW_NORMAL_BIAS_TEXELS = 1.6;


/** The sun's shadow settings for a sun at `sun.elevationDeg`: the fit follows the sun's height (#169). */
export function sunShadowFor(sun: Pick<DirectionalLighting, "elevationDeg">): SunShadowSettings {
  return {
    mapSize: SHADOW_MAP_SIZE,
    fit: {
      pitch: CAMERA_PITCH,
      fovDeg: CAMERA_FOV,
      sunElevationDeg: sun.elevationDeg,
      casterHeight: SHADOW_CASTER_HEIGHT,
      receiverDepth: SHADOW_RECEIVER_DEPTH,
      minExtent: SHADOW_EXTENT_MIN,
      maxExtent: SHADOW_EXTENT,
    },
    hysteresis: SHADOW_FIT_HYSTERESIS,
    biasTexels: SHADOW_BIAS_TEXELS,
    normalBiasTexels: SHADOW_NORMAL_BIAS_TEXELS,
    radius: SHADOW_RADIUS,
    near: SHADOW_CAMERA_NEAR,
    far: SHADOW_CAMERA_FAR,
  };
}
