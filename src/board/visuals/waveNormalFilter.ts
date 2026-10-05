/**
 * Filtering the FFT wave normals so they neither shimmer nor alias (#38).
 *
 * The cascade's output texture stores the slope (∂h/∂x, ∂h/∂z) and the
 * squared slope |∇h|², and is mipmapped. A filtered lookup therefore returns
 * the mean slope and the mean square slope over the pixel's footprint; their
 * difference is the slope variance the filtering averaged away, which goes
 * into the glint's roughness α² (LEAN mapping: Olano & Baker 2010, "LEAN
 * mapping"). Nothing is lost, only moved from the normal into the roughness.
 *
 * On top of that, each cascade fades out once its band is sub-pixel
 * (cascadeLodFade), and every cascade fades toward flat with distance from
 * the camera, past the play area. Faded slope is folded into roughness the
 * same way, so the far sea turns into a smooth, rough-specular sheet instead
 * of noise at grazing angles.
 */

/** Distance from the camera (world units) where wave normals start to fade. */
export const WAVE_DETAIL_FADE_START = 45;
/** ... and where they are flat. The scene fog ends at 85 units (atmosphere.ts). */
export const WAVE_DETAIL_FADE_END = 90;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Share of the wave normal detail kept at `distance` world units from the camera. */
export function waveDetailFade(distance: number): number {
  return 1 - smoothstep(WAVE_DETAIL_FADE_START, WAVE_DETAIL_FADE_END, distance);
}

/**
 * Per-cascade level of detail (#38 step 5). Each cascade carries a band of
 * wavelengths, from 2π / kMin down. Once even the band's longest wave spans
 * only a couple of pixels, the whole band is noise on screen: the mipmaps
 * still average it, but what they keep is the tile's repeat and, at grazing
 * angles, shimmer. So the band fades out between its longest wave spanning
 * LOD_FADE_START_PIXELS and LOD_FADE_END_PIXELS, and its slope goes into the
 * roughness instead (combineCascadeSlopes).
 */
export const LOD_FADE_START_PIXELS = 4;
export const LOD_FADE_END_PIXELS = 2;

/**
 * Share of a cascade's detail kept where a pixel spans `footprintMetres` of
 * sea, for a band starting at wavenumber `kMin` (0: the band of the longest
 * waves, which never fades this way).
 */
export function cascadeLodFade(footprintMetres: number, kMin: number): number {
  if (kMin <= 0) return 1;
  const pixels = (2 * Math.PI) / kMin / footprintMetres;
  return smoothstep(LOD_FADE_END_PIXELS, LOD_FADE_START_PIXELS, pixels);
}

/** One cascade's filtered look-up and how much of it to draw. */
export interface CascadeSlopeSample {
  /** Mean slope over the footprint, in the tile's own axes. */
  mean: readonly [number, number];
  /** Mean of |∇h|² over the footprint. */
  meanSquare: number;
  /** The tile's turn against the world (WaveCascade.rotation). */
  rotation: number;
  /** Share of the slope to draw, 0 … 1. */
  fade: number;
}

/**
 * Slope to shade with (world axes) and the slope variance to fold into
 * roughness, summed over independent cascades. Each draws `fade` of its mean
 * slope; whatever it does not draw, and whatever its filtering averaged away,
 * goes into the variance, so each cascade's mean square slope is kept.
 */
export function combineCascadeSlopes(samples: readonly CascadeSlopeSample[]): {
  slope: [number, number];
  variance: number;
} {
  const slope: [number, number] = [0, 0];
  let variance = 0;
  for (const { mean, meanSquare, rotation, fade } of samples) {
    const x = mean[0] * fade;
    const z = mean[1] * fade;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    // h(p) = f(Rᵀp) has world gradient R·∇f.
    slope[0] += c * x - s * z;
    slope[1] += s * x + c * z;
    variance += Math.max(0, meanSquare - x * x - z * z);
  }
  return { slope, variance };
}

/** GLSL for the above. Texels are vec3(mean slope, mean square); turns are (cos, sin). */
export const WAVE_NORMAL_FILTER_GLSL = `
  const float WAVE_DETAIL_FADE_START = ${WAVE_DETAIL_FADE_START.toFixed(1)};
  const float WAVE_DETAIL_FADE_END = ${WAVE_DETAIL_FADE_END.toFixed(1)};
  const float LOD_FADE_START_PIXELS = ${LOD_FADE_START_PIXELS.toFixed(1)};
  const float LOD_FADE_END_PIXELS = ${LOD_FADE_END_PIXELS.toFixed(1)};
  float waveDetailFade(float distance) {
    return 1.0 - smoothstep(WAVE_DETAIL_FADE_START, WAVE_DETAIL_FADE_END, distance);
  }
  float cascadeLodFade(float footprintMetres, float kMin) {
    if (kMin <= 0.0) return 1.0;
    float pixels = 6.28318530718 / kMin / footprintMetres;
    return smoothstep(LOD_FADE_END_PIXELS, LOD_FADE_START_PIXELS, pixels);
  }
  // Adds one cascade's drawn slope (world axes) and its undrawn variance.
  void addCascadeSlope(vec3 texel, vec2 turn, float fade, inout vec2 slope, inout float variance) {
    vec2 m = texel.xy * fade;
    slope += vec2(turn.x * m.x - turn.y * m.y, turn.y * m.x + turn.x * m.y);
    variance += max(0.0, texel.z - dot(m, m));
  }
`;
