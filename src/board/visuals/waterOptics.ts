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
 * STYLISTIC, NOT PHYSICS (user decision, #77): the shelf recedes as the
 * camera pulls out. Close up, clear turquoise water over sunlit sand is the
 * look we want; at map zoom the same shelf was a saturated bright ring that
 * the eye landed on before the island. Real distance does the opposite
 * (aerial perspective softens the shallows first), so the water body over the
 * shelf is driven by the camera's distance from its focus point: a weight
 * that is 0 up to SHELF_RECEDE_NEAR_DISTANCE, 1 from SHELF_RECEDE_FAR_DISTANCE,
 * eased in log distance since zoom is multiplicative (`shelfRecedeWeight`).
 *
 * The weight makes the water more opaque rather than veiling it: the water
 * body is computed for an effective depth
 *   real × (1 + (SHELF_FAR_DEPTH_SCALE − 1) × weight)
 *     + SHELF_FAR_DEPTH_OFFSET × weight × smoothstep(0, SHELF_OFFSET_RAMP, real)
 * (`recededDepth`), and every depth-driven term of the body (absorption on
 * both legs, seabed fade, deep lift, shallow boost) reads that depth. The
 * sunlit sand shows through less and the shelf collapses toward the water's
 * own colour along the gradient it already has: no new hue, and open water,
 * already opaque, is the same at every distance. A scale alone barely moved
 * the water right off the sand (three times half a metre is still clear
 * water over bright sand) and left the pale inner band; the offset is a
 * floor under the shallowest water, so the island fades into the sea from
 * the sand edge outward. Between about 3 and 10 m of effective depth the
 * sand is mostly absorbed but the lift (below) has not come in, a dark teal
 * trough, so the far offset is chosen to land past it. The lift, added on top
 * of the seabed close up, is composited under it by (1 − transmittance) as
 * the shelf recedes (`recededLiftShare`): added, it drew a blue band brighter
 * than both the shelf inside it and the open water outside.
 *
 * The distances are the camera's real distance from its focus point (what
 * `camera.position.distanceTo(controls.target)` returns), which since #78 is
 * also what the `dist` URL parameter and the map's iso distance give: the
 * small map's zoom floor is 4.32, its first view 23.8 and its zoom ceiling
 * 28. (The old `dist` values were 0.8246× real; dist=11 is now 9.07.) The shots the
 * numbers were tuned on: ship zoom 4.3 (weight 0, untouched), 9 (0.03, as
 * close up), 11.5 (0.23), 15 (0.54), 18 (0.78), first map view (0.98).
 */
/** Where the recession starts, real camera-to-focus units: below this the shelf is exactly the close-up shelf. */
export const SHELF_RECEDE_NEAR_DISTANCE = 8;
/** Where it is complete, real camera-to-focus units: from here out the shelf is the map-zoom shelf. */
export const SHELF_RECEDE_FAR_DISTANCE = 26;
/** Depth multiplier at the far distance: higher narrows the turquoise band and pulls it toward blue sooner. */
export const SHELF_FAR_DEPTH_SCALE = 3;
/** Depth added at the far distance, metres: higher dims the water right off the sand (12 lands past the dark trough). */
export const SHELF_FAR_DEPTH_OFFSET = 12;
/** Real depth over which the offset ramps in, metres: keeps the waterline continuous; longer leaves a pale lip. */
export const SHELF_OFFSET_RAMP = 0.2;
/**
 * STYLISTIC, NOT PHYSICS (user decision, #77): the shore foam (wash, breaker
 * line and reef bands, on the sea and up the sand) fades with the recession,
 * so at map zoom the coast is a faint line, not a white rim brighter than the
 * sand. It fades ahead of the water: half-receded, the water body over the
 * shelf has already gone dark while the breaker band at half strength still
 * drew a pale halo round every island, with a darker line of water between
 * it and the sand. So the foam is down to its far share by
 * SHORE_FOAM_FADE_END of the weight (`shoreFoamRecedeShare`). Open water's
 * whitecaps and the ships' hull foam are not touched.
 */
/** What is left of the shore foam at the far distance, 0 … 1: lower makes the far coastline quieter. */
export const SHORE_FOAM_FAR_SHARE = 0.2;
/** Weight at which the foam starts fading: later keeps the surf longer as the camera pulls out. */
export const SHORE_FOAM_FADE_START = 0;
/** Weight by which the foam is at its far share: later lets the breaker band linger as a halo over the darkened shelf. */
export const SHORE_FOAM_FADE_END = 0.5;
/**
 * The camera's real distance from its focus point (world units) as a shared
 * uniform object, like the surf clock (`surfTimeUniform`, surfMotion.ts):
 * the water writes it once a frame (Ocean.tsx) and every material that
 * recedes with it (the water, the land's shore wash in shoreFoamLand.ts)
 * binds the very same object.
 */
export const cameraDistanceUniform: { value: number } = { value: 0 };
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

/**
 * Snell's law in vector form, air into water (GLSL `refract(i, n, 1/n_w)`):
 * the unit direction of a ray travelling along unit `incident` (into the
 * surface, downward) after it crosses a facet of unit normal `normal` (up,
 * toward the air). Used for the view ray's bend at the wave facet and for the
 * sun's path to the seabed (#38 step 6).
 */
export function refractedDirection(
  incident: readonly [number, number, number],
  normal: readonly [number, number, number]
): [number, number, number] {
  const eta = 1 / WATER_IOR;
  const cos = -(incident[0] * normal[0] + incident[1] * normal[1] + incident[2] * normal[2]);
  const k = Math.sqrt(Math.max(0, 1 - eta * eta * (1 - cos * cos)));
  const along = eta * cos - k;
  return [eta * incident[0] + along * normal[0], eta * incident[1] + along * normal[1], eta * incident[2] + along * normal[2]];
}

/**
 * Horizontal travel per unit depth of a refracted ray at the critical angle,
 * tan(asin(1/n)) ≈ 1.135: the most oblique a level sea ever bends a ray. The
 * water shader caps the refracted view ray's travel here (replacing a fixed
 * pixel cap): only the tails of the gained wave slopes at grazing views reach
 * past it, and a ray that oblique would cross a hex of seabed, on which the
 * one-depth look-up (the seabed as a plane at the depth seen) says nothing.
 */
export const MAX_REFRACTED_TRAVEL = 1 / Math.sqrt(WATER_IOR * WATER_IOR - 1);

/**
 * Direct sunlight entering the water through a facet of unit normal `n`, per
 * unit of horizontal area, relative to a level surface: (n·l) / (n_y · l_y).
 * Wave faces turned toward the sun let more light into the water just below
 * them, which scatters back up; that is why sun-facing wave faces look lighter
 * across the whole sea, not only in the glint. (Transmission 1 − F is near 1
 * at the sun's 35° incidence and is left out.)
 */
export function facetSunlight(n: readonly [number, number, number], l: readonly [number, number, number]): number {
  const nDotL = n[0] * l[0] + n[1] * l[1] + n[2] * l[2];
  return Math.max(nDotL, 0) / Math.max(n[1] * l[1], 1e-3);
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
 * stays sand) and is 0 from SHALLOW_BOOST_DEPTH. It boosts the water's tint
 * only: it is scaled by 1 − `redTransmittance`, the share of red the water
 * has taken out of the seabed's light. Saturating sand seen through
 * near-clear water turned it orange, a warm halo at every waterline (#38).
 */
export function shallowSaturationBoost(depthMetres: number, redTransmittance = 0): number {
  return (
    SHALLOW_SATURATION_BOOST *
    smoothstep(0, SHALLOW_BOOST_RAMP, depthMetres) *
    (1 - smoothstep(0, SHALLOW_BOOST_DEPTH, depthMetres)) *
    (1 - Math.max(0, Math.min(1, redTransmittance)))
  );
}

/**
 * How far the shelf has receded (stylistic), 0 … 1, for a camera
 * `cameraDistance` world units from its focus point: 0 to the near distance,
 * 1 from the far one, eased in log distance.
 */
export function shelfRecedeWeight(cameraDistance: number): number {
  return smoothstep(
    Math.log(SHELF_RECEDE_NEAR_DISTANCE),
    Math.log(SHELF_RECEDE_FAR_DISTANCE),
    Math.log(Math.max(cameraDistance, 1e-3))
  );
}

/** What is left of the shore foam (stylistic) with the shelf receded by `recede`, 0 … 1: all of it close up, the far share from SHORE_FOAM_FADE_END on. */
export function shoreFoamRecedeShare(recede: number): number {
  return 1 + (SHORE_FOAM_FAR_SHARE - 1) * smoothstep(SHORE_FOAM_FADE_START, SHORE_FOAM_FADE_END, recede);
}

/** Effective-depth multiplier (stylistic) for the water body with the shelf receded by `recede`: 1 close up. */
export function recededDepthScale(recede: number): number {
  return 1 + (SHELF_FAR_DEPTH_SCALE - 1) * recede;
}

/** The effective depth (stylistic) the water body is computed for over a seabed `realMetres` down, the shelf receded by `recede`: the real depth close up. */
export function recededDepth(realMetres: number, recede: number): number {
  return realMetres * recededDepthScale(recede) + SHELF_FAR_DEPTH_OFFSET * recede * smoothstep(0, SHELF_OFFSET_RAMP, realMetres);
}

/**
 * Per-channel share of the deep lift (stylistic) the water body takes over a
 * seabed seen through transmittance `t`, the shelf receded by `recede`: all of
 * it close up (added on top, #38), (1 − t) at the far distance (composited
 * under the seabed).
 */
export function recededLiftShare(t: Rgb, recede: number): [number, number, number] {
  return map((i) => 1 + (1 - t[i] - 1) * recede);
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
/**
 * GLSL for the distance weight on its own (`shelfRecedeWeight`,
 * `shoreFoamRecedeShare`; waterOptics.ts), for materials that recede with the
 * camera but do not light water (the land's shore wash, shoreFoamLand.ts).
 * Included by WATER_OPTICS_GLSL, so a shader takes one or the other.
 */
export const SHELF_RECEDE_GLSL = `
  // Stylistic, not physics: how far the shelf has receded with camera
  // distance (shelfRecedeWeight, waterOptics.ts), and what that leaves of
  // the shore foam (shoreFoamRecedeShare).
  float shelfRecedeWeight(float cameraDistance) {
    return smoothstep(${Math.log(SHELF_RECEDE_NEAR_DISTANCE).toFixed(6)}, ${Math.log(SHELF_RECEDE_FAR_DISTANCE).toFixed(6)}, log(max(cameraDistance, 1e-3)));
  }
  float shoreFoamRecedeShare(float recede) {
    return 1.0 + ${(SHORE_FOAM_FAR_SHARE - 1).toFixed(2)} * smoothstep(${SHORE_FOAM_FADE_START.toFixed(2)}, ${SHORE_FOAM_FADE_END.toFixed(2)}, recede);
  }
`;

export const WATER_OPTICS_GLSL = `
  const vec3 WATER_ABSORPTION = ${vec3(WATER_ABSORPTION)};
  const vec3 WATER_SCATTERING = ${vec3(WATER_SCATTERING)};
  const float WATER_IOR = ${WATER_IOR.toFixed(3)};
  const float WATER_F0 = ${WATER_F0.toFixed(2)};
  const float SEABED_FADE_START = ${SEABED_FADE_START.toFixed(1)};
  const float SEABED_FADE_END = ${SEABED_FADE_END.toFixed(1)};
  const float NO_SEABED_DEPTH = ${NO_SEABED_DEPTH.toFixed(1)};
  const float MAX_REFRACTED_TRAVEL = ${MAX_REFRACTED_TRAVEL.toFixed(6)};

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
  float facetSunlight(vec3 n, vec3 l) {
    return max(dot(n, l), 0.0) / max(n.y * l.y, 1e-3);
  }
  float schlickFresnel(float cosTheta) {
    float c = clamp(cosTheta, 0.0, 1.0);
    return WATER_F0 + (1.0 - WATER_F0) * pow(1.0 - c, 5.0);
  }
  ${SHELF_RECEDE_GLSL}
  // Stylistic, not physics: the shelf recedes with camera distance; see
  // recededDepthScale, recededDepth and recededLiftShare in waterOptics.ts.
  float recededDepthScale(float recede) {
    return 1.0 + ${(SHELF_FAR_DEPTH_SCALE - 1).toFixed(2)} * recede;
  }
  float recededDepth(float realMetres, float recede) {
    return realMetres * recededDepthScale(recede) + ${SHELF_FAR_DEPTH_OFFSET.toFixed(2)} * recede * smoothstep(0.0, ${SHELF_OFFSET_RAMP.toFixed(2)}, realMetres);
  }
  vec3 recededLiftShare(vec3 t, float recede) {
    return mix(vec3(1.0), 1.0 - t, recede);
  }
  // Stylistic, not physics: see shallowSaturationBoost in waterOptics.ts.
  float shallowSaturationBoost(float depthMetres, float redTransmittance) {
    return ${SHALLOW_SATURATION_BOOST.toFixed(3)} * smoothstep(0.0, ${SHALLOW_BOOST_RAMP.toFixed(1)}, depthMetres)
      * (1.0 - smoothstep(0.0, ${SHALLOW_BOOST_DEPTH.toFixed(1)}, depthMetres))
      * (1.0 - clamp(redTransmittance, 0.0, 1.0));
  }
`;
