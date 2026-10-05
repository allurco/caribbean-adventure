/**
 * Look and fade tunables for the water hex grid lines. The line geometry
 * itself (unique shared edges) lives in `hexGridEdges.ts`.
 */
import {
  CAMERA_FOV,
  CAMERA_MAX_DISTANCE,
  CAMERA_PITCH,
  MAX_VIEW_ASPECT,
  groundViewReach,
} from "./cameraBounds";

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
 * out the fade radii grow with the distance until, at full zoom-out
 * (`CAMERA_MAX_DISTANCE`), the full grid reaches `GRID_FULL_VIEW_REACH` from
 * the focus: the whole visible map is gridded, with no fade on screen.
 */
export const GRID_FADE_ZOOM_DISTANCE = 14;

/**
 * How far across the sea the view reaches from the focus at full zoom-out,
 * on the widest supported screen (`MAX_VIEW_ASPECT`): the radius the full
 * grid must cover there. The widest aspect rather than the live one keeps the
 * fade a function of the zoom alone, the same on every screen; on a narrower
 * screen the grid simply runs a little further past the edge of the view.
 */
export const GRID_FULL_VIEW_REACH = groundViewReach(
  CAMERA_MAX_DISTANCE,
  CAMERA_PITCH,
  CAMERA_FOV,
  MAX_VIEW_ASPECT
);

/**
 * Fade params for a camera `cameraDistance` from its focus point: `params`
 * as they are up to `GRID_FADE_ZOOM_DISTANCE`, then both radii scaled by a
 * factor that grows linearly with the distance to reach
 * `GRID_FULL_VIEW_REACH / fadeStart` at `CAMERA_MAX_DISTANCE` (and keeps
 * growing beyond it), so the fade ring keeps its proportion to the full grid
 * and nothing pops as the camera pulls back.
 */
export function gridFadeForCameraDistance(
  params: GridFadeParams,
  cameraDistance: number
): GridFadeParams {
  const zoomOut = (cameraDistance - GRID_FADE_ZOOM_DISTANCE) / (CAMERA_MAX_DISTANCE - GRID_FADE_ZOOM_DISTANCE);
  if (zoomOut <= 0) return params;
  const fullScale = Math.max(1, GRID_FULL_VIEW_REACH / params.fadeStart);
  const scale = 1 + (fullScale - 1) * zoomOut;
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
