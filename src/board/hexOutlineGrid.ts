import type { Hex } from "../game/hex";
import { hexToWorld } from "../game/hex";

/**
 * Pure helpers for the merged water-hex outline geometry used by HexGrid.
 *
 * All water outlines live in one LineSegments geometry: six segments (two
 * vertices each) per hex, in world space. A per-vertex `aEmphasis` attribute
 * carries the minimum opacity for hexes the player is acting on, so the
 * shader can keep them visible while the rest of the grid fades out.
 */

export const SEGMENTS_PER_OUTLINE = 6;
export const VERTICES_PER_OUTLINE = SEGMENTS_PER_OUTLINE * 2;

/** World-space positions (xyz per vertex) for flat-top hex outlines. */
export function buildOutlinePositions(
  hexes: readonly Hex[],
  size: number,
  y: number
): Float32Array {
  const corners: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    corners.push([size * Math.cos(angle), size * Math.sin(angle)]);
  }

  const positions = new Float32Array(hexes.length * VERTICES_PER_OUTLINE * 3);
  let p = 0;
  hexes.forEach((h) => {
    const [cx, , cz] = hexToWorld(h);
    for (let edge = 0; edge < SEGMENTS_PER_OUTLINE; edge++) {
      const a = corners[edge];
      const b = corners[(edge + 1) % SEGMENTS_PER_OUTLINE];
      // Local XY hex shape laid flat on the XZ plane (rotation -PI/2 about X).
      positions[p++] = cx + a[0];
      positions[p++] = y;
      positions[p++] = cz - a[1];
      positions[p++] = cx + b[0];
      positions[p++] = y;
      positions[p++] = cz - b[1];
    }
  });
  return positions;
}

/**
 * Per-vertex emphasis (minimum opacity) for `hexCount` outlines.
 * `emphasisByIndex` maps an outline index to its emphasis; other hexes get 0.
 */
export function buildOutlineEmphasis(
  hexCount: number,
  emphasisByIndex: ReadonlyMap<number, number>,
  target: Float32Array = new Float32Array(hexCount * VERTICES_PER_OUTLINE)
): Float32Array {
  target.fill(0);
  emphasisByIndex.forEach((value, index) => {
    if (index < 0 || index >= hexCount) return;
    const start = index * VERTICES_PER_OUTLINE;
    target.fill(value, start, start + VERTICES_PER_OUTLINE);
  });
  return target;
}

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
  baseOpacity: 0.15, // same as the old uniform outline
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
 * Outline opacity at `distance` from the focus point. CPU mirror of the
 * fragment shader in `hexOutlineMaterial.ts`; keep the two in sync.
 */
export function gridFadeOpacity(
  distance: number,
  emphasis: number,
  { fadeStart, fadeEnd, baseOpacity }: GridFadeParams
): number {
  const fade = 1 - smoothstep(fadeStart, fadeEnd, distance);
  return Math.max(baseOpacity * fade, emphasis);
}
