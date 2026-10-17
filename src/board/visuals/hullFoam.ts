/**
 * Contact foam around ship hulls (#38 step 7). Pure maths, mirrored in GLSL
 * by `HULL_FOAM_GLSL`; the water shader loops it over the ships the board
 * registers each frame (shipFoamSources.ts).
 *
 * The hull is a segment of the hull length along the heading, through the
 * ship's position. Foam is strongest against it and falls off to nothing
 * HULL_FOAM_REACH hull lengths out, so the patch is elongated along the hull
 * rather than a disc. It strengthens from a few faint threads round a ship
 * at anchor (water slapping the hull) to a stirred, laced patch under way,
 * never a solid one. It lays no wake of its own: the wake trail does
 * (wakeFoam.ts), so nothing smears astern under reduced motion, when the
 * trail lays nothing (#144). The shaders break the patch up with the same
 * lace and churn as the shore foam (foamShading.ts). The crisp line where
 * the hull meets the water, the bow wave and the wet band are
 * hullContact.ts; the wake left behind is wakeFoam.ts. With the camera in
 * close the patch fades to a thin residue while the contact line stays whole
 * over the bubbles (closeFoam.ts, #389, #426): there the ships' foam flecks
 * (foamFlecks.ts) take over, so the hull no longer sits in a flat white patch
 * but keeps a white waterline.
 */
import { METRES_PER_UNIT } from "./worldScale";

/**
 * How far out the foam reaches, in hull lengths. Narrowed from 0.5, then
 * 0.35, with the contact line (hullContact.ts, #144): the crisp line carries
 * the contact, this faint patch only a few threads of stirred water round it.
 */
export const HULL_FOAM_REACH = 0.14;
/** Coverage of the ring on a ship at rest: a few faint threads round the contact line (was 0.35, then 0.2). */
export const HULL_FOAM_ANCHOR_STRENGTH = 0.12;
/** Coverage under way: a stirred, laced patch, never solid (was 1). */
export const HULL_FOAM_UNDERWAY_STRENGTH = 0.35;
/** Speed (world units per second) at which the foam is at full strength; a hex move peaks near 4. */
export const HULL_FOAM_FULL_SPEED = 2;
/**
 * STYLISTIC: one cycle of the breakup noise in water metres (ADR 0006). It
 * no longer follows the ship scale, so the lace keeps its size against the
 * waves however big the hulls are drawn; this is its size before ADR 0006
 * (14 cycles per unit at twice true scale, 2 × 115 / 350).
 */
export const HULL_FOAM_NOISE_METRES = (METRES_PER_UNIT * 2 * (115 / 350)) / 14;
/** The breakup noise's cycles per world unit, and the lace's feature size (metres) for the detail fade. */
export const HULL_FOAM_NOISE_SCALE = METRES_PER_UNIT / HULL_FOAM_NOISE_METRES;
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
  const nearest = Math.max(-bow, Math.min(bow, along));
  const distance = Math.hypot(along - nearest, across);
  const falloff = 1 - smoothstep(0, HULL_FOAM_REACH * hullLength, distance);
  return falloff * (HULL_FOAM_ANCHOR_STRENGTH + (HULL_FOAM_UNDERWAY_STRENGTH - HULL_FOAM_ANCHOR_STRENGTH) * motion);
}

/** GLSL for the above. */
export const HULL_FOAM_GLSL = `
  const float HULL_FOAM_REACH = ${HULL_FOAM_REACH.toFixed(4)};
  const float HULL_FOAM_ANCHOR_STRENGTH = ${HULL_FOAM_ANCHOR_STRENGTH.toFixed(4)};
  const float HULL_FOAM_UNDERWAY_STRENGTH = ${HULL_FOAM_UNDERWAY_STRENGTH.toFixed(4)};
  const float HULL_FOAM_FULL_SPEED = ${HULL_FOAM_FULL_SPEED.toFixed(4)};
  const float HULL_FOAM_NOISE_SCALE = ${HULL_FOAM_NOISE_SCALE.toFixed(4)};
  const float HULL_FOAM_LACE_METRES = ${HULL_FOAM_LACE_METRES.toFixed(4)};
  float hullFoamCoverage(vec2 offset, vec2 heading, float hullLength, float speed) {
    if (hullLength <= 0.0) return 0.0;
    float along = dot(offset, heading);
    float across = dot(offset, vec2(-heading.y, heading.x));
    float motion = min(1.0, max(speed, 0.0) / HULL_FOAM_FULL_SPEED);
    float bow = hullLength * 0.5;
    float nearest = clamp(along, -bow, bow);
    float distance = length(vec2(along - nearest, across));
    float falloff = 1.0 - smoothstep(0.0, HULL_FOAM_REACH * hullLength, distance);
    return falloff * mix(HULL_FOAM_ANCHOR_STRENGTH, HULL_FOAM_UNDERWAY_STRENGTH, motion);
  }
`;
