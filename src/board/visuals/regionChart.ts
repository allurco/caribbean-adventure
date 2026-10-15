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
 * The ink is part of the sea, not a second surface (ADR 0004): the shader
 * reads it at the displaced surface point nudged by the wave slope, so the
 * letters ride the swell and waver a little with the waves, and it calms the
 * slope it shades with (a slick). It is printed over what the sea shows, like
 * a chart's ink (ADR 0002): it darkens the water body's light, the sky's
 * reflection and the sun's glint together (`inkedSea`), and only the foam
 * lies over it. Ink that darkened the water body alone did not show: from
 * the game's pitch, reflection, glint and haze are much of the sea's light,
 * and gamma and haze cut a darkening in the shader to well under half on
 * screen, so the strengths below are high on purpose.
 */
import type { TerrainBounds } from "./terrainHeightField";
import { finiteColour, SUN_GLINT_MAX } from "./finiteColour";

/** Chart texels per world unit, at most: a name's smallest letters (0.32 units) are then ten texels tall. */
export const REGION_CHART_TEXELS_PER_UNIT = 32;
/** Max texels per side: WebGL2's guaranteed 2048. The large map then has about 27 per unit. */
export const REGION_CHART_MAX_SIZE = 2048;

/** How strongly a name inks the sea at full strength (the overview), 0 … 1: legible there, never loud. */
export const REGION_NAME_INK = 0.9;
/** How strongly the seam between regions does, when the borders are in the water. */
export const REGION_SEAM_INK = 0.55;

type Rgb = readonly [number, number, number];

/**
 * What the ink leaves, per channel, at full ink, of the light the sea shows:
 * the water body's, the sky's reflection and the sun's glint, like a chart's
 * ink printed over the water; only the foam lies over it. From the game's
 * pitch much of the sea's light is reflection, glint and haze, so ink that
 * darkened only the water body did not show. A deep, cool blue, so the
 * letters read as darker water rather than black.
 */
export const REGION_INK_SHADE: Rgb = [0.1, 0.14, 0.22];

/**
 * The sea's colour under `ink` (0 … 1) before the foam: the water body's
 * light `body` and the sky's reflection `sky`, split by `fresnel`, plus the
 * sun's `glint`, darkened together by the ink. The glint is unclamped HDR,
 * so it is held finite first (`finiteColour`, to `SUN_GLINT_MAX`): a NaN or
 * an overflow there would otherwise black out the frame through the bloom.
 * Mirrored in GLSL by `regionInkedSea`.
 */
export function inkedSea(body: Rgb, sky: Rgb, glint: Rgb, fresnel: number, ink: number): Rgb {
  const g = finiteColour(glint, SUN_GLINT_MAX);
  const channel = (i: 0 | 1 | 2) =>
    (body[i] * (1 - fresnel) + sky[i] * fresnel + g[i]) * (1 - ink * (1 - REGION_INK_SHADE[i]));
  return [channel(0), channel(1), channel(2)];
}

const vec3 = (c: Rgb) => `vec3(${c.map((x) => x.toFixed(4)).join(", ")})`;

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
  // How far the waves' slope nudges the look-up, world units per unit slope: the letters waver with the
  // water, a little; more broke the overview's letters (about 7 px tall) past reading.
  const float REGION_CHART_WOBBLE = 0.12;
  // How much of the slope the ink calms, at full ink: a slick on the water.
  const float REGION_INK_CALM = 0.45;
  // What the ink leaves of the sea's light, per channel, at full ink (regionChart.ts).
  const vec3 REGION_INK_SHADE = ${vec3(REGION_INK_SHADE)};

  // The sea's colour under \`ink\` before the foam: the water body's light
  // and the sky's reflection, split by \`fresnel\`, plus the sun's glint,
  // darkened together by the ink printed over them (inkedSea in regionChart.ts).
  // The glint is held finite first (finiteColour, FINITE_COLOUR_GLSL, included before this).
  vec3 regionInkedSea(vec3 body, vec3 sky, vec3 glint, float fresnel, float ink) {
    return (mix(body, sky, fresnel) + finiteColour(glint, SUN_GLINT_MAX)) * mix(vec3(1.0), REGION_INK_SHADE, ink);
  }

  // The ink at the displaced surface point \`worldXZ\` whose drawn slope is
  // \`slope\`: x the names', y the seam's, each already scaled by its strength.
  vec2 regionChartInk(vec2 worldXZ, vec2 slope) {
    vec2 uv = terrainFieldUv(worldXZ + slope * REGION_CHART_WOBBLE);
    vec4 texel = texture2D(regionChart, uv);
    if (!terrainFieldInside(uv)) return vec2(0.0);
    return vec2(texel.r * regionNameInk, texel.g * regionSeamInk);
  }
`;
