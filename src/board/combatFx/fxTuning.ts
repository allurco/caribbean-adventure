/**
 * The fight's small effects, tuned in one place (#263): the sparks' and
 * embers' size, spread, speed and life, the round shot's iron, and how
 * they all grow as the camera zooms out so they stay readable on screen at
 * the overview zoom without being huge at ship zoom. World units, seconds.
 * Pure.
 */

/** How the small effects grow with the camera's distance from its focus. */
export const FX_ZOOM = {
  /** Up to here (about ship zoom) they are drawn at true size. */
  nearDistance: 2.5,
  /** From here (the overview zoom) they hold at `maxScale`. */
  farDistance: 18,
  maxScale: 4,
} as const;

/** The sparks: a burst out of each muzzle, a smaller shower off each hit, and the embers that lift out of the smoke. */
export const SPARKS = {
  muzzle: { count: 18, reducedCount: 6, speed: 1.25, fan: 1.2, size: 0.016, sizeJitter: 0.016, life: 0.45, lifeJitter: 0.45, reducedLife: 0.25 },
  hit: { count: 9, reducedCount: 3, speed: 0.6, fan: 1.4, size: 0.012, sizeJitter: 0.012, life: 0.35, lifeJitter: 0.35, reducedLife: 0.2 },
  ember: { count: 3, reducedCount: 1, size: 0.012, sizeJitter: 0.008, life: 1.2, lifeJitter: 0.8, reducedLife: 0.8 },
} as const;

/** The muzzle flash's size. */
export const FLASH = { size: 0.12, sizeJitter: 0.05 } as const;

/**
 * The round shot: near-black iron, a little metallic, with a tight but dim
 * sun glint. Its roughness is as glossy as it can be with the glint's
 * peak still under the bloom's threshold (fxTuning.test.ts).
 */
export const SHOT_IRON = {
  /** Radius, world units: larger than true scale (a 24 lb ball is about 15 cm), like the ships (ADR 0006). */
  radius: 0.013,
  /** The faint motion streak: how long it draws along its flight, a multiple of its width. */
  streak: 1.8,
  colour: "#0b0b0c",
  metalness: 0.65,
  roughness: 0.3,
  envMapIntensity: 0.08,
} as const;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** How much the small effects are scaled at camera distance `distance`: 1 up close, easing up to the cap. */
export function fxScaleForDistance(distance: number): number {
  const t = Math.min(1, Math.max(0, (distance - FX_ZOOM.nearDistance) / (FX_ZOOM.farDistance - FX_ZOOM.nearDistance)));
  return 1 + (FX_ZOOM.maxScale - 1) * smoothstep(t);
}

/** The sRGB hex colour's linear luminance-ish value (its mean linear channel). */
function linearOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return (lin(((n >> 16) & 255) / 255) + lin(((n >> 8) & 255) / 255) + lin((n & 255) / 255)) / 3;
}

/**
 * The brightest the sun's glint gets on the shot, linear: the peak of the
 * standard material's GGX highlight (head on, D = 1 / (π α²), α the
 * roughness squared, with its reflectance F0 = mix(0.04, albedo, metalness)
 * and the visibility term at its head-on value of 1/4) under a sun of
 * `sunIntensity`.
 */
export function shotGlintPeak(iron: { colour: string; metalness: number; roughness: number }, sunIntensity: number): number {
  const alpha = iron.roughness * iron.roughness;
  const d = 1 / (Math.PI * alpha * alpha);
  const f0 = 0.04 * (1 - iron.metalness) + linearOf(iron.colour) * iron.metalness;
  return (d * f0 * sunIntensity) / 4;
}
