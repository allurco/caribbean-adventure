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
 * On top of that, the normal fades toward flat with distance from the camera,
 * past the play area, with the faded slope folded into roughness the same
 * way: the far sea turns into a smooth, rough-specular sheet instead of noise
 * at grazing angles.
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
 * Slope to shade with and the slope variance to fold into roughness, from a
 * filtered texel's mean slope and mean square slope, keeping `fade` of the detail.
 */
export function fadedWaveSlope(
  meanSlope: readonly [number, number],
  meanSquare: number,
  fade: number
): { slope: [number, number]; variance: number } {
  const slope: [number, number] = [meanSlope[0] * fade, meanSlope[1] * fade];
  const variance = Math.max(0, meanSquare - slope[0] * slope[0] - slope[1] * slope[1]);
  return { slope, variance };
}

/** GLSL for the above. */
export const WAVE_NORMAL_FILTER_GLSL = `
  const float WAVE_DETAIL_FADE_START = ${WAVE_DETAIL_FADE_START.toFixed(1)};
  const float WAVE_DETAIL_FADE_END = ${WAVE_DETAIL_FADE_END.toFixed(1)};
  float waveDetailFade(float distance) {
    return 1.0 - smoothstep(WAVE_DETAIL_FADE_START, WAVE_DETAIL_FADE_END, distance);
  }
  // Returns the slope to shade with; writes the variance to fold into roughness.
  vec2 fadedWaveSlope(vec2 meanSlope, float meanSquare, float fade, out float variance) {
    vec2 slope = meanSlope * fade;
    variance = max(0.0, meanSquare - dot(slope, slope));
    return slope;
  }
`;
