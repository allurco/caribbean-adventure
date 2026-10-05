/**
 * The sun's specular glint on the sea (#38 step 4): a microfacet BRDF with
 * the GGX / Trowbridge–Reitz normal distribution (Walter et al. 2007,
 * "Microfacet models for refraction through rough surfaces"), separable
 * Smith masking for GGX, and Schlick Fresnel with water's F0 = 0.02
 * (waterOptics.ts). Mirrored in GLSL by `SUN_GLINT_GLSL`, which needs
 * WATER_OPTICS_GLSL's `schlickFresnel` and a `PI` constant.
 *
 * Roughness is given as α²: for an isotropic sea it equals the mean square
 * slope of the facets the pixel does not resolve (both axes together), so
 * wave variance folds straight into it.
 *
 * The result is radiance in the scene's units, unclamped, so bloom sees the
 * brightest sparkles.
 */
import type { Vec3 } from "./sunDirection";
import { schlickFresnel } from "./waterOptics";

/** GGX normal distribution D at cos θh = `nDotH`, for roughness α². */
export function ggxDistribution(nDotH: number, alpha2: number): number {
  const d = nDotH * nDotH * (alpha2 - 1) + 1;
  return alpha2 / (Math.PI * d * d);
}

/** Smith G1 for GGX, for a direction at cos θ = `nDotX` from the normal. */
export function smithMasking(nDotX: number, alpha2: number): number {
  return (2 * nDotX) / (nDotX + Math.sqrt(alpha2 + (1 - alpha2) * nDotX * nDotX));
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Glint radiance toward the eye: E · D · G · F / (4 n·v), the microfacet BRDF
 * times the sun's irradiance on the surface (n·l cancels).
 *
 * @param n - surface normal (unit)
 * @param v - unit direction toward the eye
 * @param l - unit direction toward the sun
 * @param alpha2 - roughness α²
 * @param irradiance - the sun's irradiance on a surface facing it
 */
export function sunGlintRadiance(n: Vec3, v: Vec3, l: Vec3, alpha2: number, irradiance: number): number {
  const nDotL = dot(n, l);
  const nDotV = dot(n, v);
  if (nDotL <= 0 || nDotV <= 0) return 0;
  const sum: Vec3 = [v[0] + l[0], v[1] + l[1], v[2] + l[2]];
  const len = Math.hypot(...sum);
  const h: Vec3 = [sum[0] / len, sum[1] / len, sum[2] / len];
  const g = smithMasking(nDotV, alpha2) * smithMasking(nDotL, alpha2);
  const f = schlickFresnel(dot(v, h));
  return (irradiance * ggxDistribution(dot(n, h), alpha2) * g * f) / (4 * nDotV);
}

/** GLSL for the above; `irradiance` is an RGB colour × intensity. */
export const SUN_GLINT_GLSL = `
  float ggxDistribution(float nDotH, float alpha2) {
    float d = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
    return alpha2 / (PI * d * d);
  }
  float smithMasking(float nDotX, float alpha2) {
    return 2.0 * nDotX / (nDotX + sqrt(alpha2 + (1.0 - alpha2) * nDotX * nDotX));
  }
  vec3 sunGlintRadiance(vec3 n, vec3 v, vec3 l, float alpha2, vec3 irradiance) {
    float nDotL = dot(n, l);
    float nDotV = dot(n, v);
    if (nDotL <= 0.0 || nDotV <= 0.0) return vec3(0.0);
    vec3 h = normalize(v + l);
    float g = smithMasking(nDotV, alpha2) * smithMasking(nDotL, alpha2);
    float f = schlickFresnel(dot(v, h));
    return irradiance * ggxDistribution(dot(n, h), alpha2) * g * f / (4.0 * nDotV);
  }
`;
