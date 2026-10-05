/**
 * STOPGAP until step 5's cascades (#38): a second, smaller look-up of the one
 * FFT cascade, for wave detail at ship zoom.
 *
 * The near cascade's texel is ~1.95 m, which ship zoom magnifies into a smooth
 * blur. Waves shorter than that carry most of the real sea's slope (Cox–Munk
 * measure ~4× what the cascade resolves; oceanWaves.ts), so the same slope
 * texture is sampled again DETAIL_LAYER_SCALE times smaller and turned by
 * DETAIL_LAYER_ROTATION, and its slope is added at DETAIL_LAYER_GAIN. The
 * scale is non-commensurate with the main tile and the turn is off-axis, so
 * the two repeats never line up. The JONSWAP tail is close to
 * self-similar in slope (S ∝ ω⁻⁵ gives a slope spectrum ∝ k^−½), so a scaled
 * copy is a fair stand-in for the next band; step 5 replaces it with real
 * cascades on their own k-bands.
 *
 * Both layers come out of mipmapped (slope, |slope|²) look-ups; independent
 * waves add in mean and in variance, so the combined moments still carry
 * everything the filtering averaged away (waveNormalFilter.ts).
 */

/** Detail tiles per main tile: 500 m / 4.37 ≈ 114 m, a ~0.45 m texel. */
export const DETAIL_LAYER_SCALE = 4.37;
/** Turn of the detail layer against the main tile, radians. */
export const DETAIL_LAYER_ROTATION = 0.93;
/**
 * Slope gain of the detail layer. Its mean square slope is then about
 * 0.6² × 0.0095 ≈ 0.0034, which keeps main + detail (≈ 0.013) well inside
 * Cox–Munk's 0.039 for this sea.
 */
export const DETAIL_LAYER_GAIN = 0.6;

const COS = Math.cos(DETAIL_LAYER_ROTATION);
const SIN = Math.sin(DETAIL_LAYER_ROTATION);

/** Detail-layer uv for a main-tile uv: scaled up and turned by the rotation. */
export function detailLayerUv([u, v]: readonly [number, number]): [number, number] {
  return [DETAIL_LAYER_SCALE * (COS * u - SIN * v), DETAIL_LAYER_SCALE * (SIN * u + COS * v)];
}

export interface SlopeMoments {
  /** Mean slope (∂h/∂x, ∂h/∂z) over the footprint. */
  mean: readonly [number, number];
  /** Mean of |∇h|² over the footprint. */
  meanSquare: number;
}

/**
 * The surface's slope moments from the main and detail look-ups. The detail
 * slope is in its own turned frame and turns back with Rᵀ; its scale factor is
 * folded into the gain (the gain is on slope, not height).
 */
export function combineSlopeLayers(main: SlopeMoments, detail: SlopeMoments): SlopeMoments {
  const g = DETAIL_LAYER_GAIN;
  const [du, dv] = detail.mean;
  // h(R·x) has world gradient Rᵀ∇h.
  const mean: [number, number] = [
    main.mean[0] + g * (COS * du + SIN * dv),
    main.mean[1] + g * (-SIN * du + COS * dv),
  ];
  const varMain = main.meanSquare - (main.mean[0] ** 2 + main.mean[1] ** 2);
  const varDetail = g * g * (detail.meanSquare - (du * du + dv * dv));
  return { mean, meanSquare: mean[0] ** 2 + mean[1] ** 2 + varMain + varDetail };
}

const f = (x: number) => x.toFixed(8);

/** GLSL for the above. Moments travel as vec3(mean slope, mean square). */
export const WAVE_DETAIL_LAYER_GLSL = `
  const float DETAIL_LAYER_SCALE = ${f(DETAIL_LAYER_SCALE)};
  const float DETAIL_LAYER_GAIN = ${f(DETAIL_LAYER_GAIN)};
  const vec2 DETAIL_LAYER_TURN = vec2(${f(COS)}, ${f(SIN)}); // (cos θ, sin θ)
  vec2 detailLayerUv(vec2 uv) {
    vec2 t = DETAIL_LAYER_TURN;
    return DETAIL_LAYER_SCALE * vec2(t.x * uv.x - t.y * uv.y, t.y * uv.x + t.x * uv.y);
  }
  vec3 combineSlopeLayers(vec3 main, vec3 detail) {
    vec2 t = DETAIL_LAYER_TURN;
    vec2 d = detail.xy;
    vec2 mean = main.xy + DETAIL_LAYER_GAIN * vec2(t.x * d.x + t.y * d.y, -t.y * d.x + t.x * d.y);
    float variance = max(main.z - dot(main.xy, main.xy), 0.0)
      + DETAIL_LAYER_GAIN * DETAIL_LAYER_GAIN * max(detail.z - dot(d, d), 0.0);
    return vec3(mean, dot(mean, mean) + variance);
  }
`;
