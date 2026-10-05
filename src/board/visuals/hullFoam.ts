/**
 * Contact foam around ship hulls (#38 step 7). Pure maths, mirrored in GLSL
 * by `HULL_FOAM_GLSL`; the water shader loops it over the ships the board
 * registers each frame (shipFoamSources.ts).
 *
 * The hull is a segment of half the hull length along the heading, through
 * the ship's position. Foam is strongest against it and falls off to nothing
 * HULL_FOAM_REACH hull lengths out, so the patch is elongated along the hull
 * rather than a disc. Under way the segment extends astern by the speed, as
 * a wake, and the whole patch strengthens from the light ring of a ship at
 * anchor (water slapping the hull) to full. The shaders break the patch up
 * with the same lace and churn as the shore foam (foamShading.ts).
 */

/** How far out the foam reaches, in hull lengths. */
export const HULL_FOAM_REACH = 0.5;
/** Coverage of the ring on a ship at rest. */
export const HULL_FOAM_ANCHOR_STRENGTH = 0.35;
/** Speed (world units per second) at which the foam is at full strength; a hex move peaks near 4. */
export const HULL_FOAM_FULL_SPEED = 2;
/** How far the wake trails astern at full speed, in hull lengths. */
export const HULL_FOAM_WAKE_LENGTHS = 1;
/** STYLISTIC: the breakup noise's cycles per world unit and the lace's feature size (metres) for the detail fade. */
export const HULL_FOAM_NOISE_SCALE = 14;
export const HULL_FOAM_LACE_METRES = 1.2;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Foam coverage (0 … 1) at `offset` from the ship's position, for a hull of
 * `hullLength` pointing along unit `heading`, moving at `speed`.
 */
export function hullFoamCoverage(
  offset: readonly [number, number],
  heading: readonly [number, number],
  hullLength: number,
  speed: number
): number {
  if (hullLength <= 0) return 0;
  const along = offset[0] * heading[0] + offset[1] * heading[1];
  const across = -offset[0] * heading[1] + offset[1] * heading[0];
  const motion = Math.min(1, Math.max(0, speed) / HULL_FOAM_FULL_SPEED);
  const bow = hullLength / 2;
  const stern = -bow - motion * HULL_FOAM_WAKE_LENGTHS * hullLength;
  const nearest = Math.max(stern, Math.min(bow, along));
  const distance = Math.hypot(along - nearest, across);
  const falloff = 1 - smoothstep(0, HULL_FOAM_REACH * hullLength, distance);
  return falloff * (HULL_FOAM_ANCHOR_STRENGTH + (1 - HULL_FOAM_ANCHOR_STRENGTH) * motion);
}

/** GLSL for the above. */
export const HULL_FOAM_GLSL = `
  const float HULL_FOAM_REACH = ${HULL_FOAM_REACH.toFixed(4)};
  const float HULL_FOAM_ANCHOR_STRENGTH = ${HULL_FOAM_ANCHOR_STRENGTH.toFixed(4)};
  const float HULL_FOAM_FULL_SPEED = ${HULL_FOAM_FULL_SPEED.toFixed(4)};
  const float HULL_FOAM_WAKE_LENGTHS = ${HULL_FOAM_WAKE_LENGTHS.toFixed(4)};
  const float HULL_FOAM_NOISE_SCALE = ${HULL_FOAM_NOISE_SCALE.toFixed(4)};
  const float HULL_FOAM_LACE_METRES = ${HULL_FOAM_LACE_METRES.toFixed(4)};
  float hullFoamCoverage(vec2 offset, vec2 heading, float hullLength, float speed) {
    if (hullLength <= 0.0) return 0.0;
    float along = dot(offset, heading);
    float across = dot(offset, vec2(-heading.y, heading.x));
    float motion = min(1.0, max(speed, 0.0) / HULL_FOAM_FULL_SPEED);
    float bow = hullLength * 0.5;
    float stern = -bow - motion * HULL_FOAM_WAKE_LENGTHS * hullLength;
    float nearest = clamp(along, stern, bow);
    float distance = length(vec2(along - nearest, across));
    float falloff = 1.0 - smoothstep(0.0, HULL_FOAM_REACH * hullLength, distance);
    return falloff * mix(HULL_FOAM_ANCHOR_STRENGTH, 1.0, motion);
  }
`;
