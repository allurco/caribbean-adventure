/**
 * Lighting, haze and post-processing tuning for the main scene.
 *
 * Target look: warm late-afternoon Caribbean light. A low, warm sun casts
 * long shadows; a sky-blue/sea-teal hemisphere light and a cool fill tint
 * those shadows instead of leaving them grey; a pale haze softens the far
 * edge of the view. All values are plain constants so they can be tuned
 * without touching the scene graph.
 */

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

/** Hemisphere light: sky blue from above, sea teal bounced up from below. */
export const HEMI_SKY_COLOR = "#a8d8ff";
export const HEMI_GROUND_COLOR = "#2a8c8c";
export const HEMI_INTENSITY = 0.7;

/** Warm late-afternoon sun (roughly 4000 K). */
export const SUN_COLOR = "#ffd2a1";
export const SUN_INTENSITY = 2.5;
/**
 * Sun position relative to the point the camera looks at.
 * Elevation ~30 degrees (was ~48), so shadows are longer and read as afternoon.
 */
export const SUN_OFFSET: [number, number, number] = [55, 35, 25];

/**
 * Shadow map resolution and the half-width of the shadow camera's box.
 * The shadow box follows the camera target, so it only has to cover what is
 * on screen, not the whole map: 50 units across at 4096 texels is ~82 texels
 * per world unit.
 */
export const SHADOW_MAP_SIZE = 4096;
export const SHADOW_EXTENT = 25;

/** Cool sky fill from the opposite side, so shadowed faces pick up blue. */
export const FILL_COLOR = "#9ec9ff";
export const FILL_INTENSITY = 0.3;
export const FILL_POSITION: [number, number, number] = [-40, 30, 40];

/** Post-processing. */
export const BLOOM_INTENSITY = 0.25;
export const BLOOM_THRESHOLD = 0.85;
export const BLOOM_SMOOTHING = 0.9;
export const VIGNETTE_DARKNESS = 0.35;
export const VIGNETTE_OFFSET = 0.3;
