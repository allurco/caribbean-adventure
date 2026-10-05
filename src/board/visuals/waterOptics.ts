/**
 * Optics of clear tropical water (#38 step 3), per RGB channel, sampled at
 * 650 / 550 / 450 nm (the same wavelengths as the seabed albedos in
 * palette.ts). Pure maths, mirrored in GLSL by `WATER_OPTICS_GLSL`.
 *
 * Red is sampled at 650 nm, not 600: the red channel spans roughly 600–700 nm
 * and pure-water absorption rises steeply across it (0.22 / m at 600 nm,
 * 0.34 at 650, 0.47 at 680, Pope & Fry). At 600 nm the shallows kept so much
 * red that turquoise water over sand read grey.
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
 *   water as 1/2 after Morel (1974). The red value is the 600 nm one: we have
 *   not verified the 650 nm value. Scattering falls with wavelength, so this
 *   is an upper bound, and in red it is under 0.5% of absorption either way.
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

/** Pure-water absorption at 650 / 550 / 450 nm, per metre (Pope & Fry 1997). */
export const WATER_ABSORPTION: Rgb = [0.34, 0.0565, 0.00922];
/** Pure-seawater scattering at 600 / 550 / 450 nm, per metre (Smith & Baker 1981); see above for red. */
export const WATER_SCATTERING: Rgb = [0.0014, 0.0019, 0.0045];

/**
 * STYLISTIC, NOT PHYSICS (user decision, #38): extra saturation for the water
 * colour in the shallows, toward the vivid turquoise of the Water Pro
 * reference, fading out by SHALLOW_BOOST_DEPTH so deep water is untouched.
 */
const SHALLOW_SATURATION_BOOST = 0.35;
const SHALLOW_BOOST_DEPTH = 15; // metres
const SHALLOW_BOOST_RAMP = 2; // metres
/**
 * STYLISTIC, NOT PHYSICS (user decision, #38): extra reflectance added to the
 * deep-water term past the drop-off. Physical R∞ makes open water near-black
 * indigo (blue ≈ 0.08); this lifts it to a rich mid-blue (not cyan) that still
 * stays well darker than the shelf. It is 0 above DEEP_LIFT_START_DEPTH and
 * eases in to full by DEEP_LIFT_FULL_DEPTH, the top of the drop-off. Starting
 * at 15 m left a gap between the seabed fading out and the lift fading in, a
 * dark ring around every shelf (0.64× open water); 10 m still dipped. From
 * 5 m the shelf → open-water luminance is monotonic (see the test); the
 * smoothstep keeps it under 0.15 on the outer shelf to 8 m (accepted overlap
 * with the shallow saturation boost). The shader adds it on
 * top of the physical water body (not mixed by 1 − transmittance), so open
 * water gets R∞ + lift and the wall is never darker than open water.
 * Tuned so the close view's open water matches step 1e's deep blue (sRGB
 * about 16 / 59 / 96).
 */
const DEEP_WATER_LIFT: Rgb = [0.03, 0.11, 0.25];
const DEEP_LIFT_START_DEPTH = 5; // metres
const DEEP_LIFT_FULL_DEPTH = 20; // metres
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

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Saturation boost (stylistic) for water over a seabed `depthMetres` down: it
 * ramps in over the first SHALLOW_BOOST_RAMP (bare sand at the waterline
 * stays sand) and is 0 from SHALLOW_BOOST_DEPTH.
 */
export function shallowSaturationBoost(depthMetres: number): number {
  return (
    SHALLOW_SATURATION_BOOST *
    smoothstep(0, SHALLOW_BOOST_RAMP, depthMetres) *
    (1 - smoothstep(0, SHALLOW_BOOST_DEPTH, depthMetres))
  );
}

/** How much of the (stylistic) deep-water lift applies over a seabed `depthMetres` down, 0 … 1. */
export function deepWaterLiftWeight(depthMetres: number): number {
  return smoothstep(DEEP_LIFT_START_DEPTH, DEEP_LIFT_FULL_DEPTH, depthMetres);
}

/** Deep-water reflectance R∞ plus `weight` × the stylistic lift. */
export function liftedDeepWaterReflectance(weight: number): [number, number, number] {
  const physical = deepWaterReflectance();
  return map((i) => physical[i] + weight * DEEP_WATER_LIFT[i]);
}

/**
 * The water shader fades the seabed's remaining light out between these
 * depths (metres), so wherever the mesh stops, the cut never shows.
 */
export const SEABED_FADE_START = 70;
export const SEABED_FADE_END = 95;
/**
 * Depth (metres) the shader assumes where no seabed was drawn: past the fade,
 * so it reads as deep water, but close enough that interpolating towards it at
 * the mesh's edge stays smooth (a far-off value made a saw-tooth).
 */
export const NO_SEABED_DEPTH = SEABED_FADE_END + 10;

/**
 * How much of the seabed's own light still reaches the surface from
 * `depthMetres` down, at most, in the strongest channel: Beer–Lambert along
 * the shortest possible path (sun overhead, seen from straight above: 2 ×
 * depth), times the shader's fade.
 */
export function seabedVisibility(depthMetres: number): number {
  const fade = 1 - smoothstep(SEABED_FADE_START, SEABED_FADE_END, depthMetres);
  return Math.max(...waterTransmittance(2 * depthMetres)) * fade;
}

/** Contribution below which the seabed is treated as invisible. */
const SEABED_VISIBILITY_THRESHOLD = 0.01;

/**
 * Shallowest depth, to 0.1 m, from which the seabed contributes under 1% in
 * every channel; the seabed mesh stops here. `seabedVisibility` falls
 * steadily with depth, so the first depth under the threshold is the cut.
 */
export const VISIBLE_SEABED_DEPTH = (() => {
  let d = 0;
  while (seabedVisibility(d) > SEABED_VISIBILITY_THRESHOLD) d += 0.1;
  return Math.round(d * 10) / 10;
})();

const vec3 = (v: Rgb) => `vec3(${v.join(", ")})`;

/** GLSL constants and functions matching the TypeScript above. */
export const WATER_OPTICS_GLSL = `
  const vec3 WATER_ABSORPTION = ${vec3(WATER_ABSORPTION)};
  const vec3 WATER_SCATTERING = ${vec3(WATER_SCATTERING)};
  const float WATER_IOR = ${WATER_IOR.toFixed(3)};
  const float WATER_F0 = ${WATER_F0.toFixed(2)};
  const float SEABED_FADE_START = ${SEABED_FADE_START.toFixed(1)};
  const float SEABED_FADE_END = ${SEABED_FADE_END.toFixed(1)};
  const float NO_SEABED_DEPTH = ${NO_SEABED_DEPTH.toFixed(1)};

  vec3 waterTransmittance(float pathMetres) {
    return exp(-(WATER_ABSORPTION + WATER_SCATTERING) * max(pathMetres, 0.0));
  }
  vec3 deepWaterReflectance() {
    return 0.33 * ${BACKSCATTER_RATIO.toFixed(2)} * WATER_SCATTERING / WATER_ABSORPTION;
  }
  // Stylistic, not physics: see deepWaterLiftWeight in waterOptics.ts.
  float deepWaterLiftWeight(float depthMetres) {
    return smoothstep(${DEEP_LIFT_START_DEPTH.toFixed(1)}, ${DEEP_LIFT_FULL_DEPTH.toFixed(1)}, depthMetres);
  }
  vec3 liftedDeepWaterReflectance(float weight) {
    return deepWaterReflectance() + weight * ${vec3(DEEP_WATER_LIFT)};
  }
  float refractedCosine(float cosAir) {
    float sinAir2 = max(0.0, 1.0 - cosAir * cosAir);
    return sqrt(1.0 - sinAir2 / (WATER_IOR * WATER_IOR));
  }
  float schlickFresnel(float cosTheta) {
    float c = clamp(cosTheta, 0.0, 1.0);
    return WATER_F0 + (1.0 - WATER_F0) * pow(1.0 - c, 5.0);
  }
  // Stylistic, not physics: see shallowSaturationBoost in waterOptics.ts.
  float shallowSaturationBoost(float depthMetres) {
    return ${SHALLOW_SATURATION_BOOST.toFixed(3)} * smoothstep(0.0, ${SHALLOW_BOOST_RAMP.toFixed(1)}, depthMetres)
      * (1.0 - smoothstep(0.0, ${SHALLOW_BOOST_DEPTH.toFixed(1)}, depthMetres));
  }
`;
