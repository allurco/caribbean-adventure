/**
 * Analytic caustics on the seabed (#38 step 6): how the wave surface focuses
 * the sun's light, from the cascades' slope textures, with no extra pass.
 * Pure maths, mirrored in GLSL by `CAUSTIC_FOCUS_GLSL`; the seabed material
 * applies it (seabedCaustics.ts).
 *
 * Geometry. The sun's ray enters the water at a surface point S and, bent by
 * Snell's law at the wave facet there, reaches the seabed `depth` below at
 *   P(S) = S + depth · g(∇h(S)),
 * where g(s) is the refracted ray's horizontal travel per unit depth through
 * a facet of slope s. The light that a patch of surface dS carries lands on
 * the seabed patch |det J| dS, J = ∂P/∂S, so the seabed's irradiance relative
 * to a flat sea is 1 / |det J|: bright where the surface focuses (det → 0),
 * dim where it spreads. To first order in the slope,
 *   J = I + depth · G · H,   G = ∂g/∂s at s = 0,   H = ∂²h (the wave Hessian).
 *
 * G (`refractionFocusMatrix`) for a sun θ from the zenith, in the frame whose
 * x axis runs along the sun's azimuth: with sin φ = sin θ / n,
 *   G = diag(c / cos²φ, c),   c = 1 − cos θ / (n cos φ).
 * Overhead (θ = 0) this is (1 − 1/n) · I, the familiar refraction shift. The
 * in-plane entry is larger: tilting a facet in the plane of incidence changes
 * the refracted angle and the ray's obliquity together. Derived from vector
 * Snell by hand; the tests check it against the numerical derivative.
 *
 * H comes from the slope textures: the seabed shader samples the summed slope
 * at S and one texel footprint away along each screen axis, and divides the
 * differences by the footprint vectors (`hessianFromSlopeDifferences`), so the
 * Hessian is resolved to the pixel, never finer.
 */
import type { Vec3 } from "./sunDirection";
import { refractedDirection } from "./waterOptics";

/** Index of refraction of water, as waterOptics.ts. */
const WATER_IOR = 1.333;

export type Mat2 = readonly [readonly [number, number], readonly [number, number]];

/**
 * Horizontal travel per unit depth of the sun's ray once refracted through a
 * level sea, world xz: the direction away from the sun, scaled by
 * tan(asin(sin θ / n)). The surface point above a seabed point P at depth d
 * is P.xz − travel · d.
 */
export function refractedSunTravel(sun: Vec3): [number, number] {
  const r = refractedDirection([-sun[0], -sun[1], -sun[2]], [0, 1, 0]);
  const perDepth = -1 / r[1];
  return [r[0] * perDepth + 0, r[2] * perDepth + 0];
}

/** ∂(travel)/∂(slope) at a level sea for a sun along unit vector `sun`, in world xz axes. */
export function refractionFocusMatrix(sun: Vec3): Mat2 {
  const horizontal = Math.hypot(sun[0], sun[2]);
  const cosTheta = Math.min(1, Math.max(0, sun[1]));
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  const sinPhi = sinTheta / WATER_IOR;
  const cosPhi = Math.sqrt(1 - sinPhi * sinPhi);
  const across = 1 - cosTheta / (WATER_IOR * cosPhi);
  const along = across / (cosPhi * cosPhi);
  // Rotate diag(along, across) from the sun's azimuth frame into world xz.
  const cx = horizontal > 1e-9 ? sun[0] / horizontal : 1;
  const cz = horizontal > 1e-9 ? sun[2] / horizontal : 0;
  return [
    [along * cx * cx + across * cz * cz, (along - across) * cx * cz],
    [(along - across) * cx * cz, along * cz * cz + across * cx * cx],
  ];
}

/**
 * The wave Hessian H from the slope's change along two steps: `dSlopeX` is
 * the slope at S + `stepX` minus the slope at S, likewise `dSlopeZ` along
 * `stepZ`. Solving H · [stepX stepZ] = [dSlopeX dSlopeZ] gives H. Zero when
 * the steps are (nearly) parallel: a surface seen edge-on has no footprint
 * to difference across.
 */
export function hessianFromSlopeDifferences(
  dSlopeX: readonly [number, number],
  dSlopeZ: readonly [number, number],
  stepX: readonly [number, number],
  stepZ: readonly [number, number]
): Mat2 {
  const det = stepX[0] * stepZ[1] - stepZ[0] * stepX[1];
  if (Math.abs(det) <= 1e-12) return [[0, 0], [0, 0]];
  // Columns of inverse([stepX stepZ]).
  const ix: [number, number] = [stepZ[1] / det, -stepX[1] / det];
  const iz: [number, number] = [-stepZ[0] / det, stepX[0] / det];
  return [
    [dSlopeX[0] * ix[0] + dSlopeZ[0] * ix[1], dSlopeX[0] * iz[0] + dSlopeZ[0] * iz[1]],
    [dSlopeX[1] * ix[0] + dSlopeZ[1] * ix[1], dSlopeX[1] * iz[0] + dSlopeZ[1] * iz[1]],
  ];
}

/** det(I + depth · focus · hessian): the seabed area one unit of surface lights. */
export function causticJacobianDeterminant(depth: number, focus: Mat2, hessian: Mat2): number {
  const a = 1 + depth * (focus[0][0] * hessian[0][0] + focus[0][1] * hessian[1][0]);
  const b = depth * (focus[0][0] * hessian[0][1] + focus[0][1] * hessian[1][1]);
  const c = depth * (focus[1][0] * hessian[0][0] + focus[1][1] * hessian[1][0]);
  const d = 1 + depth * (focus[1][0] * hessian[0][1] + focus[1][1] * hessian[1][1]);
  return a * d - b * c;
}

/**
 * STYLISTIC, physically motivated: |det J| below which the intensity's
 * singularity is softened. At a fold det J = 0 and the single-sheet formula
 * is infinite; the real sea's finite sun (0.53° across), its sub-texel
 * roughness and the water's scattering all cap the lines. Within the knee
 * |det| is replaced by (det² + knee²) / (2 knee), which meets 1/|det| with
 * matching slope at the knee and peaks at 2 / knee: four times the mean light.
 */
export const CAUSTIC_KNEE = 0.5;

/** Seabed irradiance relative to a flat sea for Jacobian determinant `det`: 1 / |det|, softened at folds. */
export function causticIntensity(det: number): number {
  const a = Math.abs(det);
  const soft = a >= CAUSTIC_KNEE ? a : (a * a + CAUSTIC_KNEE * CAUSTIC_KNEE) / (2 * CAUSTIC_KNEE);
  return 1 / soft;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Depths, in multiples of a band's mean wavelength (2π over the geometric
 * mean of its wavenumber limits), between which its share of the Hessian
 * fades out. A wave focuses sharpest within a depth of about its wavelength;
 * deeper, the surface's map onto the seabed folds over itself (det J < 0)
 * and the single-sheet 1 / |det J| no longer describes the light, which in
 * the real sea has blurred into the sun's finite disc, the sub-texel
 * roughness and the water's scattering. So each band's curvature is counted
 * in full to one mean wavelength and not at all past three. For the ripple
 * band (0.41–3.2 m, mean 1.15 m) that is the first 1–3.5 m, the shallows the
 * old web lit; the chop band (3.2–23 m, mean 8.6 m) lasts across the shelf
 * and goes down the drop-off; the swell band's longest wave is unbounded, so
 * it never fades (its curvature is slight anyway).
 */
export const CAUSTIC_DEPTH_FADE_WAVELENGTHS: readonly [number, number] = [1, 3];

/**
 * Prepass texels a band's longest wave must span (after the smoothing below)
 * for its lines to show in full, and below which it is left out: a bright
 * line is a small part of a wavelength, so it needs several texels per wave
 * to draw without aliasing. Stricter than the normal's LOD
 * (waveNormalFilter.ts).
 */
export const CAUSTIC_LOD_TEXELS: readonly [number, number] = [4, 8];

/**
 * Prepass texels a wave must span to focus light at all: shorter waves are
 * smoothed out of the caustic look-up. Caustic cells are about a wavelength
 * across and the lines a fraction of that, so waves of a few texels draw as
 * grain, not dappled light (the old noise web found cells under ~9 screen
 * pixels, ~4–5 prepass texels, read as grain). Six texels is 2.5 m at the
 * closest ship zoom (0.42 m prepass texels), so what focuses there is the
 * 2.5–3.2 m end of the ripple band and the chop; further out only the chop,
 * and at map zoom nothing short enough to show a line.
 */
export const CAUSTIC_MIN_WAVE_TEXELS = 6;
/**
 * Mip bias of the caustic's slope look-ups: level L averages 2^L texels and
 * a bilinear sample of it resolves waves of 2 · 2^L texels and up.
 */
export const CAUSTIC_LOD_BIAS = Math.log2(CAUSTIC_MIN_WAVE_TEXELS / 2);
/** The finite-difference steps are the footprint scaled to the smoothed look-up, so the Hessian is of what was sampled. */
export const CAUSTIC_STEP_SCALE = 2 ** CAUSTIC_LOD_BIAS;

/**
 * Share of a band's focusing kept at `depthMetres`, for a band of wavenumbers
 * `kMin` … `kMax` (kMin 0: the longest waves, never faded).
 */
export function causticDepthFade(depthMetres: number, kMin: number, kMax: number): number {
  if (kMin <= 0) return 1;
  const wavelength = (2 * Math.PI) / Math.sqrt(kMin * kMax);
  return 1 - smoothstep(CAUSTIC_DEPTH_FADE_WAVELENGTHS[0] * wavelength, CAUSTIC_DEPTH_FADE_WAVELENGTHS[1] * wavelength, depthMetres);
}

/** Share of a band's focusing drawn where a prepass texel spans `footprintMetres` of seabed (kMin 0: all of it). */
export function causticLodFade(footprintMetres: number, kMin: number): number {
  if (kMin <= 0) return 1;
  const texels = (2 * Math.PI) / kMin / footprintMetres;
  return smoothstep(CAUSTIC_LOD_TEXELS[0], CAUSTIC_LOD_TEXELS[1], texels);
}

/** GLSL constants and functions matching the TypeScript above. Needs no other GLSL. */
export const CAUSTIC_FOCUS_GLSL = `
  const float CAUSTIC_KNEE = ${CAUSTIC_KNEE.toFixed(4)};
  const vec2 CAUSTIC_DEPTH_FADE_WAVELENGTHS = vec2(${CAUSTIC_DEPTH_FADE_WAVELENGTHS.map((x) => x.toFixed(2)).join(", ")});
  const vec2 CAUSTIC_LOD_TEXELS = vec2(${CAUSTIC_LOD_TEXELS.map((x) => x.toFixed(2)).join(", ")});
  const float CAUSTIC_LOD_BIAS = ${CAUSTIC_LOD_BIAS.toFixed(4)};
  const float CAUSTIC_STEP_SCALE = ${CAUSTIC_STEP_SCALE.toFixed(4)};

  // H from the slope's change along two footprint steps: H · [stepX stepZ] = [dSlopeX dSlopeZ].
  mat2 hessianFromSlopeDifferences(vec2 dSlopeX, vec2 dSlopeZ, vec2 stepX, vec2 stepZ) {
    mat2 steps = mat2(stepX, stepZ);
    if (abs(determinant(steps)) <= 1e-12) return mat2(0.0);
    return mat2(dSlopeX, dSlopeZ) * inverse(steps);
  }
  // det(I + depth · focus · hessian)
  float causticJacobianDeterminant(float depth, mat2 focus, mat2 hessian) {
    return determinant(mat2(1.0) + depth * focus * hessian);
  }
  float causticIntensity(float det) {
    float a = abs(det);
    float soft = a >= CAUSTIC_KNEE ? a : (a * a + CAUSTIC_KNEE * CAUSTIC_KNEE) / (2.0 * CAUSTIC_KNEE);
    return 1.0 / soft;
  }
  float causticDepthFade(float depthMetres, float kMin, float kMax) {
    if (kMin <= 0.0) return 1.0;
    float wavelength = 6.28318530718 / sqrt(kMin * kMax);
    return 1.0 - smoothstep(CAUSTIC_DEPTH_FADE_WAVELENGTHS.x * wavelength, CAUSTIC_DEPTH_FADE_WAVELENGTHS.y * wavelength, depthMetres);
  }
  float causticLodFade(float footprintMetres, float kMin) {
    if (kMin <= 0.0) return 1.0;
    float texels = 6.28318530718 / kMin / footprintMetres;
    return smoothstep(CAUSTIC_LOD_TEXELS.x, CAUSTIC_LOD_TEXELS.y, texels);
  }
`;
