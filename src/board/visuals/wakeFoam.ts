/**
 * The foam of a ship's wake (#144). Pure maths, mirrored in GLSL by
 * `WAKE_FOAM_GLSL`; the water shader (Ocean.tsx) runs it over the segments
 * of every ship's wake trail (wakeTrail.ts), next to the hull foam
 * (hullFoam.ts, hullContact.ts).
 *
 * A real wake reads through texture, not brightness. Two parts, both
 * measured from the path the ship's centre sailed:
 *
 * - **Turbulent centre**: the churned water the hull and rudder leave, a
 *   little narrower than the beam. Dense just astern, it settles within a
 *   second or so into thin lace, then fades out over the trail's lifetime.
 *   Its coverage peaks on the path and falls off smoothly to its edge, with
 *   no solid core, so as it thins the lace (foamShading.ts) leaves only the
 *   middle: it narrows and breaks up with age instead of standing as a
 *   uniform band. Some of it stays at low speed. The water laces it with a
 *   coarser noise than the hull foam (`WAKE_NOISE_SCALE`), so the churn keeps
 *   its gaps at mid zoom.
 * - **Kelvin arms**: a ship's waves on deep water stand on a wedge of half
 *   angle asin(1/3) ≈ 19.47° behind the bow, whatever its speed (Kelvin
 *   1887; Lighthill, "Waves in Fluids", §3.10): at a distance s astern of the
 *   bow, `s · tan 19.47°` off the path. Along that line the divergent waves'
 *   crests stand en échelon, each at about 35° to the line's normal, so the
 *   arms are drawn as short slanted feathers (`wakeArmFeather`) rather than
 *   one ruled line. They are strongest just astern, reach only
 *   `WAKE_ARM_REACH_BEAMS` astern of the bow, are stronger at speed (none at
 *   rest) and fade within `WAKE_ARM_LIFETIME_SECONDS`, well before the
 *   centre, so they never run back to a move's start.
 *
 * "Path distance" here is measured astern from the bow along the path, so
 * nothing is laid ahead of the bow. The arms are drawn at least
 * LINE_MIN_PIXELS wide, so they still read at mid zoom, and fade out where
 * they would be a fraction of a pixel (map zoom), their feathers blending to
 * their mean first; the broad centre falls back to its smooth mean with the
 * rest of the foam (foamShading.ts).
 */
import { HULL_FOAM_FULL_SPEED, HULL_FOAM_LACE_METRES, HULL_FOAM_NOISE_SCALE } from "./hullFoam";
import { lineDetailFade, lineDrawnWidth } from "./hullContact";
import { WAKE_LIFETIME_SECONDS } from "./wakeTrail";

export { WAKE_LIFETIME_SECONDS };

/** Half angle of the Kelvin wedge, radians: asin(1/3) ≈ 19.47°. */
export const KELVIN_HALF_ANGLE = Math.asin(1 / 3);
const KELVIN_TAN = Math.tan(KELVIN_HALF_ANGLE);

/** STYLISTIC: the centre's full width, in beams (was 1) ... */
export const WAKE_CENTRE_BEAMS = 1;
/** ... how much it widens per second of age (share of its width; was 0.25) ... */
export const WAKE_CENTRE_SPREAD = 0.1;
/** ... its coverage just astern at full speed (was 0.85) ... */
export const WAKE_CENTRE_STRENGTH = 0.8;
/** ... the share of that left once the fresh churn has settled ... */
export const WAKE_CENTRE_SETTLED_SHARE = 0.6;
/** ... the time constant (seconds) it settles over ... */
export const WAKE_CENTRE_FRESH_SECONDS = 0.12;
/** ... the share of the lifetime its settled lace holds before it fades out ... */
export const WAKE_CENTRE_HOLD_SHARE = 0.3;
/** ... and the share of it kept at low speed. */
export const WAKE_CENTRE_REST_SHARE = 0.4;
/** The centre's profile is flat only over this inner share of its half width. */
const WAKE_CENTRE_CORE_SHARE = 0.12;
/** STYLISTIC: an arm's half width across its line when laid, in beams (was 0.12): each crest about this long ... */
export const WAKE_ARM_BEAMS = 0.08;
/** ... how much it widens per second of age (share of its width; was 0.6) ... */
export const WAKE_ARM_SPREAD = 0.5;
/** ... its coverage at full speed (was 0.7) ... */
export const WAKE_ARM_STRENGTH = 0.75;
/** ... the seconds it lasts (the centre lasts WAKE_LIFETIME_SECONDS) ... */
export const WAKE_ARM_LIFETIME_SECONDS = 1.6;
/** ... and how far astern of the bow it reaches, in beams: it fades out over the last 60%. */
export const WAKE_ARM_REACH_BEAMS = 14;
/** STYLISTIC: crest segments along an arm, one every so many beams of path ... */
export const WAKE_FEATHER_SPACING_BEAMS = 0.2;
/** ... slanted so the crest falls aft by this much per unit out from the path: tan 35.26°, the divergent crests' angle at the cusp. */
export const WAKE_FEATHER_SLANT = Math.SQRT1_2;
/**
 * A crest is solid over FEATHER_CORE of its spacing round its middle (each
 * crest's own share, from 0.6 to 1.4 times this) and fades out over
 * FEATHER_FADE more; its middle is shifted by up to ±FEATHER_JITTER / 2 of
 * the spacing. Both vary per crest by a fixed low-discrepancy sequence, so
 * the crests are not stamped out alike, and a crest never reaches its
 * neighbour's cell.
 */
const FEATHER_CORE = 0.32;
const FEATHER_FADE = 0.25;
const FEATHER_JITTER = 0.2;
/** The crests' mean, drawn where they are too close together on screen to resolve. */
const FEATHER_MEAN = 0.5;
/** Feathers this many pixels apart or fewer blend to their mean; this many or more are drawn in full. */
const FEATHER_BLEND_PIXELS = 2;
const FEATHER_FULL_PIXELS = 4;
/** STYLISTIC: the wake's lace is this many times coarser than the hull foam's, so it keeps its gaps at mid zoom. */
const WAKE_LACE_COARSENING = 2;
/** The wake's breakup noise, cycles per world unit, and its lace's feature size (metres) for the detail fade. */
export const WAKE_NOISE_SCALE = HULL_FOAM_NOISE_SCALE / WAKE_LACE_COARSENING;
export const WAKE_LACE_METRES = HULL_FOAM_LACE_METRES * WAKE_LACE_COARSENING;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);

/** How much of the centre laid `age` seconds ago is left: fresh churn settling, then fading out over the lifetime. */
const centreAgeShare = (age: number) =>
  (1 - smoothstep(WAKE_CENTRE_HOLD_SHARE * WAKE_LIFETIME_SECONDS, WAKE_LIFETIME_SECONDS, age)) *
  (WAKE_CENTRE_SETTLED_SHARE + (1 - WAKE_CENTRE_SETTLED_SHARE) * Math.exp(-age / WAKE_CENTRE_FRESH_SECONDS));

/** The centre alone, `across` world units off the path. */
function centreCoverage(across: number, age: number, motion: number, beam: number): number {
  const halfWidth = 0.5 * beam * WAKE_CENTRE_BEAMS * (1 + WAKE_CENTRE_SPREAD * age);
  const profile = 1 - smoothstep(WAKE_CENTRE_CORE_SHARE * halfWidth, halfWidth, Math.abs(across));
  return profile * WAKE_CENTRE_STRENGTH * (WAKE_CENTRE_REST_SHARE + (1 - WAKE_CENTRE_REST_SHARE) * motion) * centreAgeShare(age);
}

/**
 * The crest segments along an arm (0 … 1) at `path` astern of the bow and
 * `across` the path, for a hull of `beam`, where a pixel spans `footprint`:
 * 1 on a crest, 0 between crests, their mean where they are too close
 * together on screen. Each crest's length and place vary a little.
 */
export function wakeArmFeather(path: number, across: number, beam: number, footprint: number): number {
  const spacing = WAKE_FEATHER_SPACING_BEAMS * beam;
  if (spacing <= 0) return 0;
  const u = (path - WAKE_FEATHER_SLANT * Math.abs(across)) / spacing;
  const cell = Math.floor(u);
  const core = FEATHER_CORE * (0.6 + 0.8 * fract(cell * 0.618034));
  const middle = 0.5 + FEATHER_JITTER * (fract(cell * 0.754878 + 0.31) - 0.5);
  const phase = Math.abs(u - cell - middle) * 2;
  const feather = 1 - smoothstep(core, core + FEATHER_FADE, phase);
  const resolved = footprint <= 0 ? 1 : smoothstep(FEATHER_BLEND_PIXELS, FEATHER_FULL_PIXELS, spacing / footprint);
  return FEATHER_MEAN + (feather - FEATHER_MEAN) * resolved;
}

/** The arms alone, at `path` astern of the bow. */
function armCoverage(path: number, across: number, age: number, motion: number, beam: number, footprint: number): number {
  if (age >= WAKE_ARM_LIFETIME_SECONDS || motion <= 0) return 0;
  const reach = WAKE_ARM_REACH_BEAMS * beam;
  if (path >= reach) return 0;
  const width = beam * WAKE_ARM_BEAMS * (1 + WAKE_ARM_SPREAD * age);
  const line = 1 - smoothstep(0, lineDrawnWidth(width, footprint), Math.abs(Math.abs(across) - path * KELVIN_TAN));
  if (line <= 0) return 0;
  const fade = (1 - smoothstep(0, WAKE_ARM_LIFETIME_SECONDS, age)) * (1 - smoothstep(0.4 * reach, reach, path));
  return line * wakeArmFeather(path, across, beam, footprint) * WAKE_ARM_STRENGTH * motion * fade * lineDetailFade(width, footprint);
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
 * The centre is a capsule round the segment; the arms are drawn only beside
 * it, so its ends, the ship's among them, put no arm foam round them.
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
 * of the bow, its wake can reach at any age where a pixel spans `footprint`:
 * its arms' farthest offset and widest drawn width while they reach, or the
 * centre's widest half. A point farther than this plus half the length from
 * the segment's midpoint has no wake from it.
 */
export function wakeSegmentReach(segmentLength: number, pathA: number, beam: number, footprint: number): number {
  const centre = 0.5 * beam * WAKE_CENTRE_BEAMS * (1 + WAKE_CENTRE_SPREAD * WAKE_LIFETIME_SECONDS);
  const armReach = WAKE_ARM_REACH_BEAMS * beam;
  if (pathA >= armReach) return centre;
  const arm =
    Math.min(pathA + segmentLength, armReach) * KELVIN_TAN +
    lineDrawnWidth(beam * WAKE_ARM_BEAMS * (1 + WAKE_ARM_SPREAD * WAKE_ARM_LIFETIME_SECONDS), footprint);
  return Math.max(centre, arm);
}

/** GLSL for the above; needs HULL_FOAM_GLSL and HULL_CONTACT_GLSL in scope. */
export const WAKE_FOAM_GLSL = `
  const float KELVIN_TAN = ${KELVIN_TAN.toFixed(6)};
  const float WAKE_LIFETIME_SECONDS = ${WAKE_LIFETIME_SECONDS.toFixed(4)};
  const float WAKE_CENTRE_BEAMS = ${WAKE_CENTRE_BEAMS.toFixed(4)};
  const float WAKE_CENTRE_SPREAD = ${WAKE_CENTRE_SPREAD.toFixed(4)};
  const float WAKE_CENTRE_STRENGTH = ${WAKE_CENTRE_STRENGTH.toFixed(4)};
  const float WAKE_CENTRE_SETTLED_SHARE = ${WAKE_CENTRE_SETTLED_SHARE.toFixed(4)};
  const float WAKE_CENTRE_FRESH_SECONDS = ${WAKE_CENTRE_FRESH_SECONDS.toFixed(4)};
  const float WAKE_CENTRE_HOLD_SHARE = ${WAKE_CENTRE_HOLD_SHARE.toFixed(4)};
  const float WAKE_CENTRE_REST_SHARE =${WAKE_CENTRE_REST_SHARE.toFixed(4)};
  const float WAKE_CENTRE_CORE_SHARE = ${WAKE_CENTRE_CORE_SHARE.toFixed(4)};
  const float WAKE_ARM_BEAMS = ${WAKE_ARM_BEAMS.toFixed(4)};
  const float WAKE_ARM_SPREAD = ${WAKE_ARM_SPREAD.toFixed(4)};
  const float WAKE_ARM_STRENGTH = ${WAKE_ARM_STRENGTH.toFixed(4)};
  const float WAKE_ARM_LIFETIME_SECONDS = ${WAKE_ARM_LIFETIME_SECONDS.toFixed(4)};
  const float WAKE_ARM_REACH_BEAMS = ${WAKE_ARM_REACH_BEAMS.toFixed(4)};
  const float WAKE_FEATHER_SPACING_BEAMS = ${WAKE_FEATHER_SPACING_BEAMS.toFixed(4)};
  const float WAKE_FEATHER_SLANT = ${WAKE_FEATHER_SLANT.toFixed(6)};
  const float WAKE_FEATHER_CORE = ${FEATHER_CORE.toFixed(4)};
  const float WAKE_FEATHER_FADE = ${FEATHER_FADE.toFixed(4)};
  const float WAKE_FEATHER_JITTER = ${FEATHER_JITTER.toFixed(4)};
  const float WAKE_FEATHER_MEAN = ${FEATHER_MEAN.toFixed(4)};
  const float WAKE_FEATHER_BLEND_PIXELS = ${FEATHER_BLEND_PIXELS.toFixed(4)};
  const float WAKE_FEATHER_FULL_PIXELS = ${FEATHER_FULL_PIXELS.toFixed(4)};
  const float WAKE_NOISE_SCALE = ${WAKE_NOISE_SCALE.toFixed(4)};
  const float WAKE_LACE_METRES = ${WAKE_LACE_METRES.toFixed(4)};
  float wakeCentreAgeShare(float age) {
    return (1.0 - smoothstep(WAKE_CENTRE_HOLD_SHARE * WAKE_LIFETIME_SECONDS, WAKE_LIFETIME_SECONDS, age))
      * mix(WAKE_CENTRE_SETTLED_SHARE, 1.0, exp(-age / WAKE_CENTRE_FRESH_SECONDS));
  }
  float wakeCentreCoverage(float across, float age, float motion, float beam) {
    float halfWidth = 0.5 * beam * WAKE_CENTRE_BEAMS * (1.0 + WAKE_CENTRE_SPREAD * age);
    float profile = 1.0 - smoothstep(WAKE_CENTRE_CORE_SHARE * halfWidth, halfWidth, abs(across));
    return profile * WAKE_CENTRE_STRENGTH * mix(WAKE_CENTRE_REST_SHARE, 1.0, motion) * wakeCentreAgeShare(age);
  }
  float wakeArmFeather(float path, float across, float beam, float footprint) {
    float spacing = WAKE_FEATHER_SPACING_BEAMS * beam;
    if (spacing <= 0.0) return 0.0;
    float u = (path - WAKE_FEATHER_SLANT * abs(across)) / spacing;
    float cell = floor(u);
    float core = WAKE_FEATHER_CORE * (0.6 + 0.8 * fract(cell * 0.618034));
    float middle = 0.5 + WAKE_FEATHER_JITTER * (fract(cell * 0.754878 + 0.31) - 0.5);
    float phase = abs(u - cell - middle) * 2.0;
    float feather = 1.0 - smoothstep(core, core + WAKE_FEATHER_FADE, phase);
    float resolved = footprint <= 0.0 ? 1.0 : smoothstep(WAKE_FEATHER_BLEND_PIXELS, WAKE_FEATHER_FULL_PIXELS, spacing / footprint);
    return mix(WAKE_FEATHER_MEAN, feather, resolved);
  }
  float wakeArmCoverage(float path, float across, float age, float motion, float beam, float footprint) {
    if (age >= WAKE_ARM_LIFETIME_SECONDS || motion <= 0.0) return 0.0;
    float reach = WAKE_ARM_REACH_BEAMS * beam;
    if (path >= reach) return 0.0;
    float width = beam * WAKE_ARM_BEAMS * (1.0 + WAKE_ARM_SPREAD * age);
    float line = 1.0 - smoothstep(0.0, lineDrawnWidth(width, footprint), abs(abs(across) - path * KELVIN_TAN));
    if (line <= 0.0) return 0.0;
    float fade = (1.0 - smoothstep(0.0, WAKE_ARM_LIFETIME_SECONDS, age)) * (1.0 - smoothstep(0.4 * reach, reach, path));
    return line * wakeArmFeather(path, across, beam, footprint) * WAKE_ARM_STRENGTH * motion * fade
      * lineDetailFade(width, footprint);
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
  float wakeSegmentReach(float segmentLength, float pathA, float beam, float footprint) {
    float centre = 0.5 * beam * WAKE_CENTRE_BEAMS * (1.0 + WAKE_CENTRE_SPREAD * WAKE_LIFETIME_SECONDS);
    float armReach = WAKE_ARM_REACH_BEAMS * beam;
    if (pathA >= armReach) return centre;
    float arm = min(pathA + segmentLength, armReach) * KELVIN_TAN
      + lineDrawnWidth(beam * WAKE_ARM_BEAMS * (1.0 + WAKE_ARM_SPREAD * WAKE_ARM_LIFETIME_SECONDS), footprint);
    return max(centre, arm);
  }
`;
