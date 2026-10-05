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

/** GLSL for the above; needs `PI` and `cascadeLodFade` (waveNormalFilter.ts) in scope. */
export const FOAM_SHADING_GLSL = `
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
