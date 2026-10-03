/**
 * Look and fade tunables for the water hex grid lines. The line geometry
 * itself (unique shared edges) lives in `hexGridEdges.ts`.
 */

/**
 * Calm grid line colour: a pale, desaturated sea tint that sits with the
 * water instead of the stark white of the shore surf (issue #32).
 */
export const GRID_LINE_COLOR = "#9ccfd6";

/**
 * Colour emphasised lines (hover, move and attack targets) blend toward, in
 * proportion to their emphasis, so acted-on hexes still pop.
 */
export const GRID_EMPHASIS_COLOR = "#ffffff";

export interface GridFadeParams {
  /** Distance from the focus point (world units) where fading begins. */
  fadeStart: number;
  /** Distance from the focus point (world units) where the grid is gone. */
  fadeEnd: number;
  /** Outline opacity inside `fadeStart`. */
  baseOpacity: number;
}

// Distance between neighbouring hex centres in world units (hex size 1).
const HEX_SPACING = Math.sqrt(3);

/**
 * Tunables for the calm grid. Distances are measured from the camera focus
 * point (the MapControls target, i.e. the centre of the view).
 */
export const GRID_FADE: GridFadeParams = {
  fadeStart: 3 * HEX_SPACING, // full faint grid within ~3 hexes
  fadeEnd: 7 * HEX_SPACING, // gone beyond ~7 hexes
  // One shared line per edge now, where the old inset rings drew two white
  // lines; a little more opacity keeps the tinted grid easy to count.
  baseOpacity: 0.2,
};

/**
 * Camera-to-focus distance up to which `GRID_FADE` applies unchanged. Further
 * out the fade radii grow in proportion to the distance, so the grid covers
 * the same share of the screen: at full zoom-out (28) that is 2x, i.e. full
 * grid within ~6 hexes and gone by ~14.
 */
export const GRID_FADE_ZOOM_DISTANCE = 14;

/** Fade params for a camera `cameraDistance` from its focus point. */
export function gridFadeForCameraDistance(
  params: GridFadeParams,
  cameraDistance: number
): GridFadeParams {
  const scale = Math.max(1, cameraDistance / GRID_FADE_ZOOM_DISTANCE);
  if (scale === 1) return params;
  return {
    ...params,
    fadeStart: params.fadeStart * scale,
    fadeEnd: params.fadeEnd * scale,
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Line opacity at `distance` from the focus point, with `shore` (0..1, see
 * `shoreFade` in `hexGridEdges.ts`) thinning the calm grid in the shallows.
 * Emphasis is not faded. CPU mirror of the fragment shader in
 * `hexOutlineMaterial.ts`; keep the two in sync.
 */
export function gridFadeOpacity(
  distance: number,
  emphasis: number,
  { fadeStart, fadeEnd, baseOpacity }: GridFadeParams,
  shore = 1
): number {
  const fade = 1 - smoothstep(fadeStart, fadeEnd, distance);
  return Math.max(baseOpacity * fade * shore, emphasis);
}
