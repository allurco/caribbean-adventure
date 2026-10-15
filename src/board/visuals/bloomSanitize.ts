/**
 * The bloom's input held finite and in range: a pass of its own, directly
 * before the bloom, that turns a pixel with a NaN to black and holds every
 * channel to `[0, BLOOM_INPUT_MAX]` (Infinity to the cap, a negative channel
 * to 0). The bloom's luminance and mipmap blur spread one NaN or Infinity
 * over the whole frame, which then draws black.
 *
 * Why such pixels can occur: with MSAA, a fragment on a silhouette is shaded
 * at the pixel centre even when that lies outside the triangle, so its
 * varyings (vertex colour, normal, view position) are extrapolated. On the
 * test GPU this left a few negative pixels a frame, down to about −3, while
 * the camera moved (none with `?aa=0`); how far it goes depends on the GPU's
 * rasteriser. NaN and Infinity are found from the float's bits, as in
 * `finiteColour`. Pure.
 */
import { FINITE_COLOUR_GLSL, HDR_COLOUR_MAX, finiteColour } from "./finiteColour";

type Rgb = readonly [number, number, number];

/** The brightest any channel may reach the bloom, linear: the sea's own cap, far over the brightest real pixel (about 40). */
export const BLOOM_INPUT_MAX = HDR_COLOUR_MAX;

/** One pixel as the sanitize pass leaves it (the GLSL's mirror). */
export function sanitizeBloomInput(c: Rgb): [number, number, number] {
  return finiteColour(c, BLOOM_INPUT_MAX);
}

/** The sanitize effect's fragment, for postprocessing's `Effect` (blend SRC). */
export const BLOOM_SANITIZE_GLSL = /* glsl */ `
  ${FINITE_COLOUR_GLSL}
  const float BLOOM_INPUT_MAX = ${BLOOM_INPUT_MAX.toFixed(1)};
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    outputColor = vec4(finiteColour(inputColor.rgb, BLOOM_INPUT_MAX), inputColor.a);
  }
`;
