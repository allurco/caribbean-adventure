/**
 * The regions written into the sea (#239): a chart texture in world XZ over
 * the terrain field's bounds (so it shares `terrainFieldUv`, and on a
 * wrapping map tiles in s as the field does), which the ocean shader reads
 * as ink in the water. Pure: its size and the GLSL; the drawing is
 * `useRegionChart.ts`.
 *
 *   R  the regions' names (`regionNamePlacement.ts`), 0 … 1
 *   G  the seam where two regions meet, 0 … 1, when the borders are drawn in
 *      the water (`regionBorderMode.ts`)
 *
 * The ink is in the water, not on it: the shader reads it at the displaced
 * surface point nudged by the wave slope, so the letters ride the swell and
 * waver a little with the waves; it calms the slope it shades with (a slick,
 * like oil on the water, so the letters catch the sky a touch more
 * smoothly) and darkens the light from the water body, under the sky's
 * reflection, the sun's glint and the foam, so glare and whitecaps wash over
 * the letters as they do over the sea (ADR 0002, ADR 0004: no second
 * surface).
 */
import type { TerrainBounds } from "./terrainHeightField";

/** Chart texels per world unit, at most: a name's smallest letters (0.32 units) are then ten texels tall. */
export const REGION_CHART_TEXELS_PER_UNIT = 32;
/** Max texels per side: WebGL2's guaranteed 2048. The large map then has about 27 per unit. */
export const REGION_CHART_MAX_SIZE = 2048;

/** How strongly a name darkens the water's own light at full strength, 0 … 1: legible at the overview, never loud. */
export const REGION_NAME_INK = 0.42;
/** How strongly the seam between regions does, when the borders are in the water. */
export const REGION_SEAM_INK = 0.3;

/** The chart's size in texels and texels per world unit for the terrain field's `bounds`. */
export function regionChartSize(bounds: TerrainBounds): { width: number; height: number; texelsPerUnit: number } {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxZ - bounds.minZ;
  const texelsPerUnit = Math.min(REGION_CHART_TEXELS_PER_UNIT, REGION_CHART_MAX_SIZE / Math.max(w, h));
  return {
    width: Math.max(1, Math.min(REGION_CHART_MAX_SIZE, Math.round(w * texelsPerUnit))),
    height: Math.max(1, Math.min(REGION_CHART_MAX_SIZE, Math.round(h * texelsPerUnit))),
    texelsPerUnit,
  };
}

/**
 * Read in the ocean's fragment stage after `TERRAIN_FIELD_GLSL` (it shares
 * `terrainFieldUv`, `mapBounds` and the wrap define).
 */
export const REGION_CHART_GLSL = `
  uniform sampler2D regionChart;
  uniform float regionNameInk; // REGION_NAME_INK × regionNameStrength(camera distance)
  uniform float regionSeamInk; // REGION_SEAM_INK, or 0 when the borders are drawn as lines
  // How far the waves' slope nudges the look-up, world units per unit slope: the letters waver with the water.
  const float REGION_CHART_WOBBLE = 0.35;
  // How much of the slope the ink calms, at full ink: a slick on the water.
  const float REGION_INK_CALM = 0.45;
  // What the ink leaves of the water body's light, per channel, at full ink: a deeper, cooler blue.
  const vec3 REGION_INK_SHADE = vec3(0.55, 0.66, 0.78);

  // The ink at the displaced surface point \`worldXZ\` whose drawn slope is
  // \`slope\`: x the names', y the seam's, each already scaled by its strength.
  vec2 regionChartInk(vec2 worldXZ, vec2 slope) {
    vec2 uv = terrainFieldUv(worldXZ + slope * REGION_CHART_WOBBLE);
    vec4 texel = texture2D(regionChart, uv);
    if (!terrainFieldInside(uv)) return vec2(0.0);
    return vec2(texel.r * regionNameInk, texel.g * regionSeamInk);
  }
`;
