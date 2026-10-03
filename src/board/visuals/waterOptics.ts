/**
 * Optics of clear tropical water (#38 step 3), per RGB channel, sampled at
 * 600 / 550 / 450 nm (the same wavelengths as the seabed albedos in
 * palette.ts). Pure maths, mirrored in GLSL by `WATER_OPTICS_GLSL`.
 *
 * Coefficients are for pure seawater, the clearest natural water; real
 * Caribbean water carries a little extra absorption from dissolved matter and
 * plankton, so this errs towards too clear.
 * - Absorption a: Pope & Fry (1997), "Absorption spectrum (380-700 nm) of
 *   pure water. II. Integrating cavity measurements", Applied Optics. Values
 *   from the Oregon Medical Laser Center table of the paper's data
 *   (omlc.org/spectra/water/data/pope97.txt, given there in 1/cm).
 * - Scattering b: Smith & Baker (1981), "Optical properties of the clearest
 *   natural waters (200-800 nm)", Applied Optics 20(2), via a table that also
 *   lists Pope & Fry's absorption and takes the backscatter ratio of pure
 *   water as 1/2 after Morel (1974).
 * - Deep-water irradiance reflectance (just below the surface)
 *   R∞ = 0.33 · b_b / a: Morel & Prieur (1977), Limnology and Oceanography
 *   22(4), Eq. 1.
 *
 * Model. Seen through `path` metres of water (down to the seabed and back
 * up), the seabed's radiance is attenuated by Beer–Lambert transmittance
 * T = e^(−c·path), with c = a + b the beam attenuation, and the water column
 * adds the light it scatters back up, which tends to that of infinitely deep
 * water as T → 0:
 *   body = seabed · T + deep · (1 − T),   deep = R∞ · (downwelling irradiance).
 * This ignores the radiance change across the surface (n², transmission) and
 * treats the downwelling light as a single beam along the refracted sun.
 */

type Rgb = readonly [number, number, number];

/** Index of refraction of water in the visible. */
const WATER_IOR = 1.333;
/** Schlick reflectance of water at normal incidence: ((1.333 − 1) / (1.333 + 1))² ≈ 0.02. */
const WATER_F0 = 0.02;

/** Pure-water absorption at 600 / 550 / 450 nm, per metre (Pope & Fry 1997). */
export const WATER_ABSORPTION: Rgb = [0.2224, 0.0565, 0.00922];
/** Pure-seawater scattering at 600 / 550 / 450 nm, per metre (Smith & Baker 1981). */
export const WATER_SCATTERING: Rgb = [0.0014, 0.0019, 0.0045];
/** Share of scattering that goes backwards in pure water (Morel 1974). */
const BACKSCATTER_RATIO = 0.5;

const map = (f: (i: 0 | 1 | 2) => number): [number, number, number] => [f(0), f(1), f(2)];

/** Beam attenuation c = a + b, per metre. */
const ATTENUATION: Rgb = map((i) => WATER_ABSORPTION[i] + WATER_SCATTERING[i]);

/** Beer–Lambert transmittance through `pathMetres` of water, per channel. */
export function waterTransmittance(pathMetres: number): [number, number, number] {
  if (pathMetres <= 0) return [1, 1, 1];
  return map((i) => Math.exp(-ATTENUATION[i] * pathMetres));
}

/** Irradiance reflectance of infinitely deep water, R∞ = 0.33 · b_b / a (Morel & Prieur 1977). */
export function deepWaterReflectance(): [number, number, number] {
  return map((i) => (0.33 * BACKSCATTER_RATIO * WATER_SCATTERING[i]) / WATER_ABSORPTION[i]);
}

/** Water-body radiance: the seabed seen through transmittance `t`, plus the deep-water glow. */
export function waterBodyRadiance(seabed: Rgb, deep: Rgb, t: Rgb): [number, number, number] {
  return map((i) => seabed[i] * t[i] + deep[i] * (1 - t[i]));
}

/** Cosine from vertical of a ray that enters water at `cosAir` from vertical (Snell's law). */
export function refractedCosine(cosAir: number): number {
  const sinAir2 = Math.max(0, 1 - cosAir * cosAir);
  return Math.sqrt(1 - sinAir2 / (WATER_IOR * WATER_IOR));
}

/** Schlick's Fresnel reflectance of water for a ray `cosTheta` from the normal. */
export function schlickFresnel(cosTheta: number): number {
  const c = Math.max(0, Math.min(1, cosTheta));
  return WATER_F0 + (1 - WATER_F0) * Math.pow(1 - c, 5);
}

const vec3 = (v: Rgb) => `vec3(${v.join(", ")})`;

/** GLSL constants and functions matching the TypeScript above. */
export const WATER_OPTICS_GLSL = `
  const vec3 WATER_ABSORPTION = ${vec3(WATER_ABSORPTION)};
  const vec3 WATER_SCATTERING = ${vec3(WATER_SCATTERING)};
  const float WATER_IOR = ${WATER_IOR.toFixed(3)};
  const float WATER_F0 = ${WATER_F0.toFixed(2)};

  vec3 waterTransmittance(float pathMetres) {
    return exp(-(WATER_ABSORPTION + WATER_SCATTERING) * max(pathMetres, 0.0));
  }
  vec3 deepWaterReflectance() {
    return 0.33 * ${BACKSCATTER_RATIO.toFixed(2)} * WATER_SCATTERING / WATER_ABSORPTION;
  }
  float refractedCosine(float cosAir) {
    float sinAir2 = max(0.0, 1.0 - cosAir * cosAir);
    return sqrt(1.0 - sinAir2 / (WATER_IOR * WATER_IOR));
  }
  float schlickFresnel(float cosTheta) {
    float c = clamp(cosTheta, 0.0, 1.0);
    return WATER_F0 + (1.0 - WATER_F0) * pow(1.0 - c, 5.0);
  }
`;
