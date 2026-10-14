/**
 * The foam of a ship's wake (#144). Pure maths, mirrored in GLSL by
 * `WAKE_FOAM_GLSL`; the water shader (Ocean.tsx) runs it over the segments
 * of every ship's wake trail (wakeTrail.ts), next to the hull foam
 * (hullFoam.ts, hullContact.ts), taking the strongest, so the wake and the
 * hull foam join without a seam.
 *
 * Two parts, both measured from the path the ship's centre sailed:
 *
 * - **Turbulent centre line**: the churned water the hull and rudder leave,
 *   about a beam wide, strongest just astern, widening a little and fading
 *   with age. Some of it stays at low speed.
 * - **Kelvin arms**: a ship's waves on deep water stand on a wedge of half
 *   angle asin(1/3) ≈ 19.47° behind the bow, whatever its speed (Kelvin
 *   1887; Lighthill, "Waves in Fluids", §3.10). Drawn as two thin foam lines
 *   at that angle either side of the path: at a distance s astern of the
 *   bow, `s · tan 19.47°` off the path. They widen and fade with age, and are
 *   stronger at speed (none at rest).
 *
 * "Path distance" here is measured astern from the bow along the path, so
 * nothing is laid ahead of the bow. The foam's lace is the hull foam's,
 * sized in water metres; the arms, thin lines, fade out where they fall
 * under a couple of pixels (map zoom), and the broad centre line falls back
 * to its smooth mean with the rest of the foam (foamShading.ts).
 */
import { HULL_FOAM_FULL_SPEED } from "./hullFoam";
import { lineDetailFade } from "./hullContact";
import { WAKE_LIFETIME_SECONDS } from "./wakeTrail";

export { WAKE_LIFETIME_SECONDS };

/** Half angle of the Kelvin wedge, radians: asin(1/3) ≈ 19.47°. */
export const KELVIN_HALF_ANGLE = Math.asin(1 / 3);
const KELVIN_TAN = Math.tan(KELVIN_HALF_ANGLE);

/** STYLISTIC: the centre line's full width, in beams ... */
export const WAKE_CENTRE_BEAMS = 1;
/** ... how much it widens per second of age (share of its width) ... */
export const WAKE_CENTRE_SPREAD = 0.25;
/** ... its coverage just astern at full speed ... */
export const WAKE_CENTRE_STRENGTH = 0.85;
/** ... and the share of that it keeps at low speed. */
export const WAKE_CENTRE_REST_SHARE = 0.4;
/** STYLISTIC: an arm's width when laid, in beams ... */
export const WAKE_ARM_BEAMS = 0.12;
/** ... how much it widens per second of age (share of its width) ... */
export const WAKE_ARM_SPREAD = 0.6;
/** ... and its coverage at full speed. */
export const WAKE_ARM_STRENGTH = 0.7;
/** The centre line's inner share stays solid; it softens over the outer part. */
const WAKE_CENTRE_SOLID_SHARE = 0.4;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How much of the foam laid `age` seconds ago is left: all of it when laid, none after the lifetime. */
const ageFade = (age: number) => 1 - smoothstep(0, WAKE_LIFETIME_SECONDS, age);

/** The centre line alone, `across` world units off the path. */
function centreCoverage(across: number, age: number, motion: number, beam: number): number {
  const halfWidth = 0.5 * beam * WAKE_CENTRE_BEAMS * (1 + WAKE_CENTRE_SPREAD * age);
  const band = 1 - smoothstep(WAKE_CENTRE_SOLID_SHARE * halfWidth, halfWidth, Math.abs(across));
  return band * WAKE_CENTRE_STRENGTH * (WAKE_CENTRE_REST_SHARE + (1 - WAKE_CENTRE_REST_SHARE) * motion) * ageFade(age);
}

/** The arms alone, at `path` astern of the bow. */
function armCoverage(path: number, across: number, age: number, motion: number, beam: number, footprint: number): number {
  const width = beam * WAKE_ARM_BEAMS * (1 + WAKE_ARM_SPREAD * age);
  const line = 1 - smoothstep(0, width, Math.abs(Math.abs(across) - path * KELVIN_TAN));
  return line * WAKE_ARM_STRENGTH * motion * ageFade(age) * lineDetailFade(width, footprint);
}

/**
 * Wake coverage (0 … 1) at `path` world units astern of the bow along the
 * path and `across` it, on water the ship passed `age` seconds ago at
 * `speed` (world units per second), for a hull of `beam`, where a pixel
 * spans `footprint` world units.
 */
export function wakeFoamCoverage(path: number, across: number, age: number, speed: number, beam: number, footprint: number): number {
  if (beam <= 0 || path < 0 || age >= WAKE_LIFETIME_SECONDS) return 0;
  const motion = Math.min(1, Math.max(0, speed) / HULL_FOAM_FULL_SPEED);
  return Math.max(centreCoverage(across, age, motion, beam), armCoverage(path, across, age, motion, beam, footprint));
}

/**
 * The wake of one trail segment at `offset` from its newer end a, the
 * segment running astern by `ab` to its older end b. The ends were laid
 * `ageA` and `ageB` seconds ago; a is `pathA` astern of the bow along the
 * path. The speed is the segment's length over the time between its ends.
 * The centre line is a capsule round the segment; the arms are drawn only
 * beside it, so its ends, the ship's among them, put no arm foam round them.
 */
export function wakeSegmentCoverage(
  offset: readonly [number, number],
  ab: readonly [number, number],
  ageA: number,
  ageB: number,
  pathA: number,
  beam: number,
  footprint: number,
): number {
  const length2 = ab[0] * ab[0] + ab[1] * ab[1];
  if (length2 <= 1e-12 || beam <= 0) return 0;
  const length = Math.sqrt(length2);
  const tRaw = (offset[0] * ab[0] + offset[1] * ab[1]) / length2;
  const t = Math.max(0, Math.min(1, tRaw));
  const across = Math.hypot(offset[0] - ab[0] * t, offset[1] - ab[1] * t);
  const age = ageA + (ageB - ageA) * t;
  if (age >= WAKE_LIFETIME_SECONDS) return 0;
  const speed = length / Math.max(ageB - ageA, 1e-3);
  const motion = Math.min(1, speed / HULL_FOAM_FULL_SPEED);
  const centre = centreCoverage(across, age, motion, beam);
  const beside = tRaw >= 0 && tRaw <= 1;
  return beside ? Math.max(centre, armCoverage(pathA + t * length, across, age, motion, beam, footprint)) : centre;
}

/**
 * How far off a segment of `segmentLength`, whose newer end is `pathA` astern
 * of the bow, its wake can reach at any age: its arms' farthest offset and
 * widest width, or the centre line's widest half. A point farther than this
 * plus half the length from the segment's midpoint has no wake from it.
 */
export function wakeSegmentReach(segmentLength: number, pathA: number, beam: number): number {
  const centre = 0.5 * beam * WAKE_CENTRE_BEAMS * (1 + WAKE_CENTRE_SPREAD * WAKE_LIFETIME_SECONDS);
  const arm = (pathA + segmentLength) * KELVIN_TAN + beam * WAKE_ARM_BEAMS * (1 + WAKE_ARM_SPREAD * WAKE_LIFETIME_SECONDS);
  return Math.max(centre, arm);
}

/** GLSL for the above; needs HULL_FOAM_GLSL and HULL_CONTACT_GLSL in scope. */
export const WAKE_FOAM_GLSL = `
  const float KELVIN_TAN = ${KELVIN_TAN.toFixed(6)};
  const float WAKE_LIFETIME_SECONDS = ${WAKE_LIFETIME_SECONDS.toFixed(4)};
  const float WAKE_CENTRE_BEAMS = ${WAKE_CENTRE_BEAMS.toFixed(4)};
  const float WAKE_CENTRE_SPREAD = ${WAKE_CENTRE_SPREAD.toFixed(4)};
  const float WAKE_CENTRE_STRENGTH = ${WAKE_CENTRE_STRENGTH.toFixed(4)};
  const float WAKE_CENTRE_REST_SHARE = ${WAKE_CENTRE_REST_SHARE.toFixed(4)};
  const float WAKE_CENTRE_SOLID_SHARE = ${WAKE_CENTRE_SOLID_SHARE.toFixed(4)};
  const float WAKE_ARM_BEAMS = ${WAKE_ARM_BEAMS.toFixed(4)};
  const float WAKE_ARM_SPREAD = ${WAKE_ARM_SPREAD.toFixed(4)};
  const float WAKE_ARM_STRENGTH = ${WAKE_ARM_STRENGTH.toFixed(4)};
  float wakeAgeFade(float age) {
    return 1.0 - smoothstep(0.0, WAKE_LIFETIME_SECONDS, age);
  }
  float wakeCentreCoverage(float across, float age, float motion, float beam) {
    float halfWidth = 0.5 * beam * WAKE_CENTRE_BEAMS * (1.0 + WAKE_CENTRE_SPREAD * age);
    float band = 1.0 - smoothstep(WAKE_CENTRE_SOLID_SHARE * halfWidth, halfWidth, abs(across));
    return band * WAKE_CENTRE_STRENGTH * mix(WAKE_CENTRE_REST_SHARE, 1.0, motion) * wakeAgeFade(age);
  }
  float wakeArmCoverage(float path, float across, float age, float motion, float beam, float footprint) {
    float width = beam * WAKE_ARM_BEAMS * (1.0 + WAKE_ARM_SPREAD * age);
    float line = 1.0 - smoothstep(0.0, width, abs(abs(across) - path * KELVIN_TAN));
    return line * WAKE_ARM_STRENGTH * motion * wakeAgeFade(age) * lineDetailFade(width, footprint);
  }
  float wakeFoamCoverage(float path, float across, float age, float speed, float beam, float footprint) {
    if (beam <= 0.0 || path < 0.0 || age >= WAKE_LIFETIME_SECONDS) return 0.0;
    float motion = min(1.0, max(speed, 0.0) / HULL_FOAM_FULL_SPEED);
    return max(wakeCentreCoverage(across, age, motion, beam), wakeArmCoverage(path, across, age, motion, beam, footprint));
  }
  float wakeSegmentCoverage(vec2 offset, vec2 ab, float ageA, float ageB, float pathA, float beam, float footprint) {
    float length2 = dot(ab, ab);
    if (length2 <= 1e-12 || beam <= 0.0) return 0.0;
    float segmentLength = sqrt(length2);
    float tRaw = dot(offset, ab) / length2;
    float t = clamp(tRaw, 0.0, 1.0);
    float across = length(offset - ab * t);
    float age = mix(ageA, ageB, t);
    if (age >= WAKE_LIFETIME_SECONDS) return 0.0;
    float motion = min(1.0, segmentLength / max(ageB - ageA, 1e-3) / HULL_FOAM_FULL_SPEED);
    float centre = wakeCentreCoverage(across, age, motion, beam);
    if (tRaw < 0.0 || tRaw > 1.0) return centre;
    return max(centre, wakeArmCoverage(pathA + t * segmentLength, across, age, motion, beam, footprint));
  }
  float wakeSegmentReach(float segmentLength, float pathA, float beam) {
    float centre = 0.5 * beam * WAKE_CENTRE_BEAMS * (1.0 + WAKE_CENTRE_SPREAD * WAKE_LIFETIME_SECONDS);
    float arm = (pathA + segmentLength) * KELVIN_TAN + beam * WAKE_ARM_BEAMS * (1.0 + WAKE_ARM_SPREAD * WAKE_LIFETIME_SECONDS);
    return max(centre, arm);
  }
`;
