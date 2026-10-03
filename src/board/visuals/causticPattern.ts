/**
 * Scale, contrast and level of detail for the shallow-water caustic web
 * (#11, retuned for #38). The web itself (thin lines at the zero crossings of
 * two drifting value-noise layers) is unchanged and lives in Ocean.tsx; step 6
 * replaces it with analytic caustics.
 *
 * - Scale: one noise cell is CAUSTIC_CELL_METRES across at the render scale.
 *   Caustic cells under a sunlit, wind-rippled surface are roughly 0.3–1 m
 *   across (an observation, not a sourced measurement). At 1 m a cell was
 *   only 3–4 pixels even at the closest zoom and read as grain, not dappled
 *   light, so we use a stylised 2.5 m cell: ~9 px at the closest zoom, so the
 *   web shows there, and ~2–3 px at map zoom, where it is faded out.
 * - Light, not paint: caustics redistribute the sunlight reaching the seabed,
 *   they don't add any. `causticLight` scales the seabed's direct sunlight
 *   by a factor whose mean over the pattern is 1: bright lines, slightly
 *   darker cells between them.
 * - Contrast: line peaks sit `causticContrast(depth)` over the mean, 25% from
 *   1 to 3 m, fading in from the waterline and out by 12 m as the focused
 *   light spreads.
 * - Level of detail: where a cell covers only a few pixels the web would
 *   alias into shimmer, so `causticLod` blends it to its mean (even light)
 *   between 6 and 3 pixels per cell, measured with fwidth of the noise
 *   coordinate. At map zoom the shelf is evenly lit; the web only appears
 *   when the camera zooms in.
 */
import { METRES_PER_UNIT } from "./worldScale";

/** Size of one caustic cell on the seabed, metres. */
export const CAUSTIC_CELL_METRES = 2.5;
/** Caustic noise frequency: noise cells per world unit. */
export const CAUSTIC_FREQUENCY = METRES_PER_UNIT / CAUSTIC_CELL_METRES;
/**
 * Mean of the web pattern (max of two line layers, each 1 at a noise zero
 * crossing and 0 beyond CAUSTIC_LINE_WIDTH), measured by sampling the shader's
 * noise at 4 million points.
 */
export const CAUSTIC_WEB_MEAN = 0.182;

/** Line peak over the mean at full strength. */
const PEAK_CONTRAST = 0.25;
/** Depth (metres) over which the web fades in from the waterline. */
const FADE_IN = 1;
/** Depths (metres) over which the web fades out. */
const FADE_OUT: readonly [number, number] = [3, 12];
/**
 * Pixels per cell at which the web starts to show, and is fully shown. The
 * light lines are ~1/8 of a cell wide, so below ~3 px per cell they are
 * sub-pixel and would shimmer.
 */
const LOD_PIXELS: readonly [number, number] = [3, 6];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** How far line peaks rise over the mean light at `depthMetres` of water. */
export function causticContrast(depthMetres: number): number {
  return PEAK_CONTRAST * smoothstep(0, FADE_IN, depthMetres) * (1 - smoothstep(FADE_OUT[0], FADE_OUT[1], depthMetres));
}

/** 0 … 1: how much of the web to show when one cell spans `cellPixels` on screen. */
export function causticLod(cellPixels: number): number {
  return smoothstep(LOD_PIXELS[0], LOD_PIXELS[1], cellPixels);
}

/** Factor on the seabed's direct sunlight for a web value in 0 … 1; averages 1 over the pattern. */
export function causticLight(web: number, contrast: number): number {
  return 1 + (contrast * (web - CAUSTIC_WEB_MEAN)) / (1 - CAUSTIC_WEB_MEAN);
}

/** GLSL constants and functions matching the TypeScript above. */
export const CAUSTIC_PATTERN_GLSL = `
  const float CAUSTIC_FREQUENCY = ${CAUSTIC_FREQUENCY.toFixed(4)};
  const float CAUSTIC_WEB_MEAN = ${CAUSTIC_WEB_MEAN.toFixed(4)};
  float causticContrast(float depthMetres) {
    return ${PEAK_CONTRAST.toFixed(4)} * smoothstep(0.0, ${FADE_IN.toFixed(1)}, depthMetres)
      * (1.0 - smoothstep(${FADE_OUT[0].toFixed(1)}, ${FADE_OUT[1].toFixed(1)}, depthMetres));
  }
  float causticLod(float cellPixels) {
    return smoothstep(${LOD_PIXELS[0].toFixed(1)}, ${LOD_PIXELS[1].toFixed(1)}, cellPixels);
  }
  float causticLight(float web, float contrast) {
    return 1.0 + contrast * (web - CAUSTIC_WEB_MEAN) / (1.0 - CAUSTIC_WEB_MEAN);
  }
`;
