/**
 * How foam is combined and shaded (#38 step 7), shared by the whitecaps,
 * the shore and reef bands and the hull foam. Pure maths, mirrored in GLSL by
 * `FOAM_SHADING_GLSL`; the water shader (Ocean.tsx) and the land's shoreline
 * patch (shoreFoamLand.ts) apply it.
 *
 * Coverage. Each source gives a smooth coverage in 0 … 1. They are unioned,
 * 1 − Π(1 − cᵢ), so overlapping foam saturates toward solid white instead of
 * adding past it. A smooth coverage reads as a stain, so each is broken up
 * by a world-space noise into lace: the noise passes where it exceeds
 * 1 − coverage, with a soft edge, so thin foam is a few bright threads and
 * dense foam is nearly solid. Where the lace's features fall under a few
 * pixels (map zoom) it fades back to the smooth coverage, so the far shore
 * reads as a thin bright line instead of shimmering.
 *
 * Shading. Foam is a rough, opaque, diffuse layer: a Lambertian of albedo
 * FOAM_ALBEDO lit by the sun and the sky, in the same irradiance units the
 * water body uses (sun irradiance · cos / π plus the sky's diffuse term), and
 * it replaces the water under it, Fresnel sky reflection and glint
 * included. Real whitecap albedo is ~0.5–0.9 and falls as the foam thins
 * (Frouin et al. 1996, JGR 101, "Spectral reflectance of sea foam in the
 * visible and near-infrared"); the high end stands in for fresh foam and
 * the lace does the thinning. Slightly warm, so it never reads bluer than
 * the sky it is lit by.
 */
import { cascadeLodFade } from "./waveNormalFilter";

type Rgb = readonly [number, number, number];

/** Linear albedo of fresh foam: luminance ≈ 0.88, a touch warm. */
export const FOAM_ALBEDO: Rgb = [0.9, 0.88, 0.85];

/** Edge softness of the lace: the noise range over which a thread fades in. */
export const FOAM_LACE_SOFTNESS = 0.2;

/** Union of independent coverages: 1 − Π(1 − c). */
export function combineFoam(coverages: readonly number[]): number {
  let clear = 1;
  for (const c of coverages) clear *= 1 - Math.max(0, Math.min(1, c));
  return 1 - clear;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The lace drawn at `coverage` for breakup `noise` (0 … 1): the noise above 1 − coverage, softly. */
export function foamLace(coverage: number, noise: number): number {
  if (coverage <= 0) return 0;
  const threshold = 1 - Math.min(1, coverage);
  return smoothstep(threshold, threshold + FOAM_LACE_SOFTNESS, noise);
}

/** Share of the lace kept where a pixel spans `footprintMetres` and the lace's features are `featureMetres` across. */
export function foamDetailFade(footprintMetres: number, featureMetres: number): number {
  return cascadeLodFade(footprintMetres, (2 * Math.PI) / featureMetres);
}

/**
 * Radiance of foam whose normal makes cos `nDotL` with the sun, under
 * `sunIrradiance` (a surface facing the sun) and the sky's diffuse term.
 */
export function foamRadiance(nDotL: number, sunIrradiance: Rgb, skyDiffuse: Rgb): [number, number, number] {
  const sun = Math.max(nDotL, 0) / Math.PI;
  return [0, 1, 2].map((i) => FOAM_ALBEDO[i] * (sunIrradiance[i] * sun + skyDiffuse[i])) as [number, number, number];
}

/**
 * Share of the smooth coverage drawn where the lace has faded out (map
 * zoom): about the lace's mean, so the far shore keeps its brightness as a
 * thin line.
 */
export const FOAM_FAR_SHARE = 0.6;

/**
 * GLSL for the foam's motion (issue #10, kept from the old surf): the pulse
 * toward and away from the shore, the churn that circles the breakup noise,
 * and the breakup noise itself. Needs SURF_TIMING_GLSL (surfMotion.ts) and
 * PI in scope. Time only enters as sin/cos of 2π·surfTime/period (the clock
 * is wrapped on the CPU), so nothing here loses precision over a session.
 */
export const FOAM_MOTION_GLSL = `
  const float SURF_PHASE_SCALE = 0.45;   // along-coast phase noise frequency; lower = longer stretches in step
  const float SURF_PHASE_SPREAD = 3.0;   // radians of pulse offset between stretches of coast
  const float SURF_CHURN_AMOUNT = 0.35;  // radius (noise units) the breakup noise circles each churn cycle
  const float FOAM_LACE_SCALE = 4.3;     // frequency multiplier of the fine octave that turns patches into lace

  // Wrap coordinates to prevent floating-point precision loss at large values
  vec2 foamWrapCoord(vec2 p) {
    return mod(p, 289.0);
  }
  float foamHash(vec2 p) {
    p = foamWrapCoord(p);
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
  }
  // Value noise in −1 … 1.
  float foamNoise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 iw = foamWrapCoord(i);
    return -1.0 + 2.0 * mix(
      mix(foamHash(iw + vec2(0.0, 0.0)), foamHash(iw + vec2(1.0, 0.0)), u.x),
      mix(foamHash(iw + vec2(0.0, 1.0)), foamHash(iw + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  // The surf pulse (0 ebb … 1 flood) at worldXZ: each stretch of coast gets
  // its own phase, so the surf does not move in step; \`lead\` shifts it.
  float surfPulse(vec2 worldXZ, float surfTime, float lead) {
    float phase = foamNoise(worldXZ * SURF_PHASE_SCALE) * SURF_PHASE_SPREAD;
    return 0.5 + 0.5 * sin(2.0 * PI * surfTime / SURF_PULSE_PERIOD + phase + lead);
  }
  // The breakup noise circles a small loop each churn cycle (bounded offset, so precision-safe).
  vec2 surfChurn(float surfTime) {
    float angle = 2.0 * PI * surfTime / SURF_CHURN_PERIOD;
    return vec2(cos(angle), sin(angle)) * SURF_CHURN_AMOUNT;
  }
  // Breakup noise in about 0 … 1 at worldXZ, \`scale\` cycles per world unit, churned by \`churn\`.
  float foamBreakupNoise(vec2 worldXZ, float scale, vec2 churn) {
    vec2 q = worldXZ * scale;
    return 0.5 + 0.22 * foamNoise(q + churn) + 0.18 * foamNoise(q * 2.1 - churn.yx)
      + 0.1 * foamNoise(q * FOAM_LACE_SCALE + churn * 1.7);
  }
`;

/** GLSL for the above; needs `PI` and `cascadeLodFade` (waveNormalFilter.ts) in scope. */
export const FOAM_SHADING_GLSL = `
  const float FOAM_FAR_SHARE = ${FOAM_FAR_SHARE.toFixed(4)};
  const vec3 FOAM_ALBEDO = vec3(${FOAM_ALBEDO.map((v) => v.toFixed(4)).join(", ")});
  const float FOAM_LACE_SOFTNESS = ${FOAM_LACE_SOFTNESS.toFixed(4)};
  float combineFoam(float a, float b, float c) {
    return 1.0 - (1.0 - a) * (1.0 - b) * (1.0 - c);
  }
  float foamLace(float coverage, float noise) {
    if (coverage <= 0.0) return 0.0;
    float threshold = 1.0 - min(coverage, 1.0);
    return smoothstep(threshold, threshold + FOAM_LACE_SOFTNESS, noise);
  }
  float foamDetailFade(float footprintMetres, float featureMetres) {
    return cascadeLodFade(footprintMetres, 6.28318530718 / featureMetres);
  }
  vec3 foamRadiance(vec3 n, vec3 l, vec3 sunIrradiance, vec3 skyDiffuse) {
    return FOAM_ALBEDO * (sunIrradiance * max(dot(n, l), 0.0) / PI + skyDiffuse);
  }
`;
