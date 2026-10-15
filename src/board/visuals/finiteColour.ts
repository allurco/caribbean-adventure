/**
 * A finite colour for the frame: what the sea's shader hands on is held to
 * `[0, max]`, and a NaN becomes black. The post-processing (bloom, tone
 * mapping) works in half-float buffers whose largest value is 65504: a
 * brighter pixel overflows to Infinity there, and the bloom's blur turns one
 * Infinity or NaN into NaN over the whole frame, which draws black.
 * Mirrored in GLSL by `finiteColour` (`FINITE_COLOUR_GLSL`). Pure.
 */
type Rgb = readonly [number, number, number];

/** The brightest the sun's glint may be, linear: far over the bloom's threshold, so the sparkles still bloom. */
export const SUN_GLINT_MAX = 64;
/** The brightest any channel of the sea may leave its shader, linear: well inside a half float. */
export const HDR_COLOUR_MAX = 256;

export function finiteColour(c: Rgb, max: number): [number, number, number] {
  if (c.some(Number.isNaN)) return [0, 0, 0];
  const hold = (x: number) => Math.min(max, Math.max(0, x));
  return [hold(c[0]), hold(c[1]), hold(c[2])];
}

export const FINITE_COLOUR_GLSL = /* glsl */ `
  const float SUN_GLINT_MAX = ${SUN_GLINT_MAX.toFixed(1)};
  const float HDR_COLOUR_MAX = ${HDR_COLOUR_MAX.toFixed(1)};
  // The colour held to [0, maxValue], black where it is NaN (finiteColour.ts).
  vec3 finiteColour(vec3 c, float maxValue) {
    vec3 held = clamp(c, 0.0, maxValue);
    return (any(isnan(c)) || any(isnan(held)) || any(isinf(held))) ? vec3(0.0) : held;
  }
`;
