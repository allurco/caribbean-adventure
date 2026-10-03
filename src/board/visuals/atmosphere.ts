/**
 * Lighting, haze and post-processing tuning for the main scene.
 *
 * Target look: warm late-afternoon Caribbean light. A low, warm sun in front
 * of the camera casts long shadows and a glint on the sea; a physical sky,
 * baked to an environment map, fills the shadows with blue sky light; a pale
 * haze softens the far edge of the view. All values are plain constants so
 * they can be tuned without touching the scene graph.
 */

import { CAMERA_OFFSET } from "../cameraBounds";
import { sunDirection, viewDirectionXZ } from "./sunDirection";

/** Pale, slightly warm sky haze. Used for both the fog and the scene background. */
export const HAZE_COLOR = "#bcd4da";

/**
 * Linear fog range in camera-space depth (world units).
 * MapControls caps the camera at 28 units from its target, so at full zoom-out
 * the bottom of the screen sits ~20 units deep and the top ~45. Starting the
 * fog just past the camera's max distance keeps the play area crisp and only
 * hazes the far third of the view.
 */
export const HAZE_NEAR = 28;
export const HAZE_FAR = 85;

/** Warm late-afternoon sun (roughly 4000 K). */
export const SUN_COLOR = "#ffd2a1";
export const SUN_INTENSITY = 2.5;

/**
 * Sun placement, relative to the camera's view (see sunDirection.ts).
 *
 * The sun sits in front of the camera so its mirror glint on the sea is on
 * screen. A flat sea reflects the sun where the view ray dips below the horizon
 * by the sun's elevation; with the camera pitched 46.7° down and a 45° vertical
 * field of view, view rays dip 24°–69°, so 35° puts the glint in the upper
 * half of the screen at every zoom (tested). It is still low enough for long,
 * late-afternoon shadows. The 25° swing to the left keeps the glint off the
 * port panel on the right and gives shadows a diagonal, not a straight-down,
 * direction.
 */
export const SUN_ELEVATION_DEG = 35;
export const SUN_AZIMUTH_DEG = -25;
export const SUN_DIRECTION = sunDirection(
  viewDirectionXZ(CAMERA_OFFSET),
  SUN_ELEVATION_DEG,
  SUN_AZIMUTH_DEG
);
/** Shadow-casting light position relative to the camera target: along SUN_DIRECTION, at the old ~70-unit distance. */
const SUN_DISTANCE = 70;
export const SUN_OFFSET: [number, number, number] = [
  SUN_DIRECTION[0] * SUN_DISTANCE,
  SUN_DIRECTION[1] * SUN_DISTANCE,
  SUN_DIRECTION[2] * SUN_DISTANCE,
];

/**
 * Sky (three's Preetham model), baked to an environment map that lights the
 * whole scene. It replaces the old hemisphere and fill lights, which were
 * stand-ins for the same sky light; keeping them would light everything twice.
 *
 * - Turbidity 3: Preetham's "clear" sky; 2 is very clear, 6 humid haze.
 *   Caribbean air is clear but moist.
 * - Rayleigh 2: three's Sky subtracts 1 from this for a sun at unit distance,
 *   so 2 gives the physical Rayleigh scattering (1.0).
 * - Mie terms: three's defaults (0.005, 0.8).
 */
export const SKY_TURBIDITY = 3;
export const SKY_RAYLEIGH = 2;
export const SKY_MIE_COEFFICIENT = 0.005;
export const SKY_MIE_DIRECTIONAL_G = 0.8;
/**
 * Diffuse share of the light on level ground under a clear sky. Erbs et al.
 * (1982) give ≈ 0.18 at a clearness index of 0.75, typical of clear tropical
 * days. Sets the brightness of the sky lighting relative to the sun.
 */
export const SKY_DIFFUSE_FRACTION = 0.18;
/**
 * Diffuse reflectance of the sea, which lights the scene from below. Open
 * ocean reflects about 6% (Payne 1972); slightly green-blue from the water.
 */
export const SEA_BOUNCE_ALBEDO: [number, number, number] = [0.04, 0.07, 0.08];

/**
 * Shadow map resolution and the half-width of the shadow camera's box.
 * The shadow box follows the camera target, so it only has to cover what is
 * on screen, not the whole map: 50 units across at 4096 texels is ~82 texels
 * per world unit.
 */
export const SHADOW_MAP_SIZE = 4096;
export const SHADOW_EXTENT = 25;

/** Post-processing. */
export const BLOOM_INTENSITY = 0.25;
export const BLOOM_THRESHOLD = 0.85;
export const BLOOM_SMOOTHING = 0.9;
export const VIGNETTE_DARKNESS = 0.35;
export const VIGNETTE_OFFSET = 0.3;
