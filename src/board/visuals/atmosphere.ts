/**
 * Lighting, haze and post-processing tuning for the main scene.
 *
 * Target look: warm mid-afternoon Caribbean light. A high, warm sun in front
 * of the camera casts moderate shadows and a glint on the sea; a physical sky,
 * baked to an environment map, fills the shadows with blue sky light; a pale
 * haze softens the far edge of the view. All values are plain constants so
 * they can be tuned without touching the scene graph.
 */

import { PCFShadowMap } from "three";
import { CAMERA_FOV, CAMERA_OFFSET, CAMERA_PITCH } from "../cameraBounds";
import type { SunShadowSettings } from "../shadowFit";
import { sunDirection, viewDirectionXZ } from "./sunDirection";
import { downwardViewFactor, seaBounceAlbedo } from "./skyEnvironment";
import { ELEVATION_HEIGHTS, RELIEF_AMPLITUDES } from "./terrainHeightField";

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

/**
 * Warm sun (roughly 4000 K). Kept from the earlier late-afternoon look; a
 * clear-sky sun at 55° is nearer 5000 K, so this is a deliberate warm grade.
 */
export const SUN_COLOR = "#ffd2a1";
export const SUN_INTENSITY = 2.5;

/**
 * Sun placement, relative to the camera's view (see sunDirection.ts), so it
 * turns with the camera: the camera looks due north (CAMERA_OFFSET), which
 * puts the sun north-west of the focus; it was tuned with the old diagonal
 * view and kept the same elevation and azimuth when the camera turned (#36).
 *
 * The sun sits in front of the camera so its mirror glint on the sea is on
 * screen. A flat sea reflects the sun where the view ray dips below the horizon
 * by the sun's elevation; with the camera pitched 46.7° down and a 45° vertical
 * field of view, view rays dip 24°–69°, so any elevation in that range puts
 * the glint on screen.
 *
 * Elevation 55° was chosen by measurement. A sun in front of the camera
 * backlights the slopes facing it; raising it lights them more directly.
 * Scanning 35°–65° (each with its widest valid azimuth), the camera-facing hill
 * luminance at wide zoom rose steadily up to 55°, then gained under 5% more
 * up to 65°. That gives a mid-afternoon sun with moderate shadows, not long
 * late-afternoon ones.
 *
 * The swing to the left keeps the glint off the port panel on the right and
 * lights the camera-facing slopes from the side. 48° is the widest swing that
 * keeps the glint at least 0.1 (NDC) inside every screen edge at every tested
 * zoom and aspect (tested); it then sits in the lower-left quarter of the
 * screen.
 */
export const SUN_ELEVATION_DEG = 55;
export const SUN_AZIMUTH_DEG = -48;
export const SUN_DIRECTION = sunDirection(
  viewDirectionXZ(CAMERA_OFFSET),
  SUN_ELEVATION_DEG,
  SUN_AZIMUTH_DEG
);
/** Shadow-casting light position relative to the camera target: along SUN_DIRECTION, at the old ~70-unit distance. */
export const SUN_DISTANCE = 70;
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
 * `shadowFit.ts`): its half-extent is the furthest visible sea point plus a
 * margin for receivers above the sea, clamped to [SHADOW_EXTENT_MIN,
 * SHADOW_EXTENT]. At full zoom-out (distance 28) the 16:9 view reaches ~43
 * units, so the box sits at the cap, 50 units across at 4096 texels: ~82
 * texels per world unit, a 0.8 m texel. At ship zoom (distance ~3.5) it
 * fits to ~7 units, a 0.2 m texel, 3.7× finer than the fixed box gave. The
 * cap is where today's resolution comes from, so the map stays at 4096: at
 * 2048 the map-zoom texel would double.
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
 * Growing refits at once (the box must cover the view); the box only shrinks
 * once the fitted extent has fallen this fraction of the current one below
 * it. A wheel tick zooms 5% but moves the extent by less (the caster margin
 * does not zoom), so zooming in shrinks the box about every second tick and
 * the damping between ticks does not re-snap the texel grid.
 */
export const SHADOW_FIT_HYSTERESIS = 0.05;
/**
 * Shadow camera depth planes along the sun, world units. From the sun 70
 * units out, the scene (seabed floor −1.9 to SHADOW_CASTER_HEIGHT) fills
 * 49…90 at the 25-unit extent and 64…75 at the minimum (`shadowDepthRange`,
 * checked in atmosphere.test.ts); three's 24-bit depth makes the slack free.
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

export const SUN_SHADOW: SunShadowSettings = {
  mapSize: SHADOW_MAP_SIZE,
  fit: {
    pitch: CAMERA_PITCH,
    fovDeg: CAMERA_FOV,
    sunElevationDeg: SUN_ELEVATION_DEG,
    casterHeight: SHADOW_CASTER_HEIGHT,
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

/** Post-processing. */
export const BLOOM_INTENSITY = 0.25;
export const BLOOM_THRESHOLD = 0.85;
export const BLOOM_SMOOTHING = 0.9;
export const VIGNETTE_DARKNESS = 0.35;
export const VIGNETTE_OFFSET = 0.3;
