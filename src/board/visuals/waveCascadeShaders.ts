/**
 * GLSL for the FFT cascade's GPU passes (#38); `useWaveCascade.ts` runs them.
 * Every pass draws one full-screen triangle over a size² target and reads its
 * inputs with texelFetch, so texel (x, z) is grid index z · size + x, as in
 * waveCascade.ts and fftButterfly.ts.
 *
 * Working textures hold two complex numbers per texel (RG and BA). RG is the
 * packed slope spectrum (∂h/∂x + i ∂h/∂z); BA is spare, kept for the
 * displacement derivatives the Jacobian needs (step 7), at no extra pass.
 */
import type { WaveCascade } from "./waveCascade";
import { GRAVITY } from "./waveDispersion";

const f = (x: number) => x.toFixed(8);

export const FULLSCREEN_VERTEX = `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COMPLEX_GLSL = `
  vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }
`;

/**
 * The slope spectrum at the current time, the GPU mirror of
 * `evolvedAmplitude` × (i·kx − kz) in waveCascade.ts.
 */
export function spectrumFragment(cascade: WaveCascade, loopSeconds: number): string {
  return `
  uniform sampler2D initialSpectrum; // (h0(k), conj(h0(−k)))
  uniform float cycles;              // wave time / loop, in [0, 1)
  const float SIZE = ${f(cascade.size)};
  const float TILE_METRES = ${f(cascade.tileMetres)};
  const float LOOP_SECONDS = ${f(loopSeconds)};
  const float GRAVITY = ${f(GRAVITY)};
  const float TAU = 6.283185307;
  ${COMPLEX_GLSL}

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec2 n = vec2(p);
    n -= SIZE * step(SIZE * 0.5, n); // standard FFT order
    vec2 k = TAU * n / TILE_METRES;
    // Whole cycles per loop (wavePeriodMultiple), so phase stays small and exact.
    float m = floor(sqrt(GRAVITY * length(k)) * LOOP_SECONDS / TAU + 0.5);
    float phase = TAU * fract(m * cycles);
    vec2 e = vec2(cos(phase), sin(phase));
    vec4 h0 = texelFetch(initialSpectrum, p, 0);
    vec2 h = cmul(h0.xy, vec2(e.x, -e.y)) + cmul(h0.zw, e);
    gl_FragColor = vec4(cmul(h, vec2(-k.y, k.x)), 0.0, 0.0);
  }
`;
}

/** One Stockham stage along rows (horizontal) or columns, from the butterfly table. */
export const FFT_STAGE_FRAGMENT = `
  uniform sampler2D source;
  uniform sampler2D butterfly; // (input a, input b, twiddle), one row per stage
  uniform int stage;
  uniform bool horizontal;
  ${COMPLEX_GLSL}

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 b = texelFetch(butterfly, ivec2(horizontal ? p.x : p.y, stage), 0);
    ivec2 pa = horizontal ? ivec2(int(b.x), p.y) : ivec2(p.x, int(b.x));
    ivec2 pb = horizontal ? ivec2(int(b.y), p.y) : ivec2(p.x, int(b.y));
    vec4 a = texelFetch(source, pa, 0);
    vec4 v = texelFetch(source, pb, 0);
    gl_FragColor = a + vec4(cmul(b.zw, v.xy), cmul(b.zw, v.zw));
  }
`;

/**
 * The output texture the water samples, mipmapped: (∂h/∂x, ∂h/∂z, |∇h|², spare).
 * Storing |∇h|² lets the mipmaps keep the slope variance (waveNormalFilter.ts).
 */
export const SLOPE_OUTPUT_FRAGMENT = `
  uniform sampler2D source;

  void main() {
    vec2 slope = texelFetch(source, ivec2(gl_FragCoord.xy), 0).xy;
    gl_FragColor = vec4(slope, dot(slope, slope), 0.0);
  }
`;
