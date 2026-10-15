/**
 * A finite colour for the frame: what the sea's shader hands on is held to
 * `[0, max]`, and a NaN becomes black. The post-processing (bloom, tone
 * mapping) works in half-float buffers whose largest value is 65504: a
 * brighter pixel overflows to Infinity there, and the bloom's blur turns one
 * Infinity or NaN into NaN over the whole frame, which draws black.
 * Mirrored in GLSL by `finiteColour` (`FINITE_COLOUR_GLSL`). Pure.
 */
type Rgb = readonly [number, number, number];

/**
 * The brightest the sun's glint may be, linear. Not a lighting value, so
 * not in lighting.ts (ADR 0002 amendment b): a guard that catches only
 * broken values (a NaN, an overflow) before the region ink multiplies them.
 * The brightest real sparkle, a facet mirroring the sun
 * into the edge of the (never rotating) camera's view, is about 100 at any
 * hour; this is far over ten times that (finiteColour.test.ts), so no real
 * sparkle loses its bloom.
 */
export const SUN_GLINT_MAX = 4096;
/**
 * The brightest any channel of the sea may leave its shader, linear: over
 * the glint's cap, and under a quarter of a half float's largest value
 * (65504), so the bloom's summed mips never overflow to Infinity.
 */
export const HDR_COLOUR_MAX = 8192;

export function finiteColour(c: Rgb, max: number): [number, number, number] {
  if (c.some(Number.isNaN)) return [0, 0, 0];
  const hold = (x: number) => Math.min(max, Math.max(0, x));
  return [hold(c[0]), hold(c[1]), hold(c[2])];
}

export const FINITE_COLOUR_GLSL = /* glsl */ `
  const float SUN_GLINT_MAX = ${SUN_GLINT_MAX.toFixed(1)};
  const float HDR_COLOUR_MAX = ${HDR_COLOUR_MAX.toFixed(1)};
  // One channel held to [0, maxValue]; \`isNan\` set where it is NaN. NaN and
  // Infinity are found from the float's bits (exponent all ones): isnan and
  // isinf may be folded to false under fast-math, as Metal compiles.
  float finiteChannel(float x, float maxValue, inout bool isNan) {
    uint bits = floatBitsToUint(x);
    if ((bits & 0x7f800000u) == 0x7f800000u) {
      if ((bits & 0x007fffffu) != 0u) isNan = true;
      return (bits & 0x80000000u) != 0u ? 0.0 : maxValue;
    }
    return clamp(x, 0.0, maxValue);
  }
  // The colour held to [0, maxValue], black where it is NaN (finiteColour.ts).
  vec3 finiteColour(vec3 c, float maxValue) {
    bool isNan = false;
    vec3 held = vec3(finiteChannel(c.r, maxValue, isNan), finiteChannel(c.g, maxValue, isNan), finiteChannel(c.b, maxValue, isNan));
    return isNan ? vec3(0.0) : held;
  }
`;
