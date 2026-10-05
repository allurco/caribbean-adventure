/**
 * GLSL for the FFT cascade's GPU passes (#38); `useWaveCascades.ts` runs them.
 * Every pass draws one full-screen triangle over a size² target and reads its
 * inputs with texelFetch, so texel (x, z) is grid index z · size + x, as in
 * waveCascade.ts and fftButterfly.ts.
 *
 * Working textures hold two complex numbers per texel (RG and BA). RG is the
 * packed slope spectrum (∂h/∂x + i ∂h/∂z); BA is the packed stretch spectrum
 * (∂Du/∂u + i ∂Dv/∂v along and across the wind, #38 step 7), which the
 * output pass turns into the surface Jacobian for the whitecaps, at no extra
 * FFT pass (waveCascade.ts, whitecapFoam.ts).
 */
import { WAVE_CHOPPINESS } from "./oceanWaves";
import { windInTile, type WaveCascade } from "./waveCascade";
import { GRAVITY } from "./waveDispersion";
import { WHITECAP_FOAM_GLSL } from "./whitecapFoam";

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
 * `evolvedAmplitude` × (i·kx − kz) in waveCascade.ts, over the cascades'
 * atlas (waveCascadeAtlas.ts): cascade c is atlas columns [c·size, (c + 1)·size).
 * All cascades must share one size.
 */
export function spectrumFragment(cascades: readonly WaveCascade[], loopSeconds: number): string {
  const size = cascades[0].size;
  if (cascades.some((c) => c.size !== size)) throw new RangeError("Batched cascades must share one grid size.");
  const tiles = cascades.map((c) => f(c.tileMetres)).join(", ");
  const winds = cascades
    .map((c) => {
      const [x, z] = windInTile(c);
      return `vec2(${f(x)}, ${f(z)})`;
    })
    .join(", ");
  return `
  uniform sampler2D initialSpectrum; // (h0(k), conj(h0(−k))), the cascades side by side
  uniform float cycles;              // wave time / loop, in [0, 1)
  const int SIZE = ${size};
  const float TILE_METRES[${cascades.length}] = float[${cascades.length}](${tiles});
  const vec2 WIND_IN_TILE[${cascades.length}] = vec2[${cascades.length}](${winds});
  const float CHOPPINESS = ${f(WAVE_CHOPPINESS)};
  const float LOOP_SECONDS = ${f(loopSeconds)};
  const float GRAVITY = ${f(GRAVITY)};
  const float TAU = 6.283185307;
  ${COMPLEX_GLSL}

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    int cascade = p.x / SIZE;
    vec2 n = vec2(p.x - cascade * SIZE, p.y);
    n -= float(SIZE) * step(float(SIZE) * 0.5, n); // standard FFT order
    vec2 k = TAU * n / TILE_METRES[cascade];
    // Whole cycles per loop (wavePeriodMultiple), so phase stays small and exact.
    float m = floor(sqrt(GRAVITY * length(k)) * LOOP_SECONDS / TAU + 0.5);
    float phase = TAU * fract(m * cycles);
    vec2 e = vec2(cos(phase), sin(phase));
    vec4 h0 = texelFetch(initialSpectrum, p, 0);
    vec2 h = cmul(h0.xy, vec2(e.x, -e.y)) + cmul(h0.zw, e);
    // The choppy stretch along and across the wind (waveCascade.ts): real
    // coefficients, so the pair packs like the slopes. The mean (k = 0) is 0.
    vec2 u = WIND_IN_TILE[cascade];
    float along = dot(k, u);
    float across = dot(k, vec2(-u.y, u.x));
    vec2 stretch = -CHOPPINESS * vec2(along * along, across * across) / max(length(k), 1e-6);
    gl_FragColor = vec4(cmul(h, vec2(-k.y, k.x)), cmul(h, stretch));
  }
`;
}

/**
 * One Stockham stage along rows (horizontal) or columns, from the butterfly
 * table. Rows stay inside each cascade's block of the atlas: the table is one
 * cascade wide, so its width is the grid size.
 */
export const FFT_STAGE_FRAGMENT = `
  uniform sampler2D source;
  uniform sampler2D butterfly; // (input a, input b, twiddle), one row per stage
  uniform int stage;
  uniform bool horizontal;
  ${COMPLEX_GLSL}

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    int size = textureSize(butterfly, 0).x;
    int block = p.x - p.x % size; // first column of this cascade
    vec4 b = texelFetch(butterfly, ivec2(horizontal ? p.x - block : p.y, stage), 0);
    ivec2 pa = horizontal ? ivec2(block + int(b.x), p.y) : ivec2(p.x, int(b.x));
    ivec2 pb = horizontal ? ivec2(block + int(b.y), p.y) : ivec2(p.x, int(b.y));
    vec4 a = texelFetch(source, pa, 0);
    vec4 v = texelFetch(source, pb, 0);
    gl_FragColor = a + vec4(cmul(b.zw, v.xy), cmul(b.zw, v.zw));
  }
`;

/**
 * The output texture the water samples, mipmapped: (∂h/∂x, ∂h/∂z, |∇h|², J).
 * Storing |∇h|² lets the mipmaps keep the slope variance (waveNormalFilter.ts);
 * J is the surface Jacobian of the choppy stretch (whitecapFoam.ts), read by
 * the accumulation pass below. One cascade per draw: `column` is its first
 * column in the atlas.
 */
export const SLOPE_OUTPUT_FRAGMENT = `
  uniform sampler2D source;
  uniform int column;
  ${WHITECAP_FOAM_GLSL}

  void main() {
    vec4 texel = texelFetch(source, ivec2(gl_FragCoord.xy) + ivec2(column, 0), 0);
    gl_FragColor = vec4(texel.xy, dot(texel.xy, texel.xy), surfaceJacobian(texel.zw));
  }
`;

/**
 * Whitecap accumulation (#38 step 7): one draw per whitecapping cascade into
 * a tile-space ping-pong target of the cascade's own size, so it tiles with
 * the cascade and the water samples it with the same tile transform as the
 * slopes. Each texel keeps the previous frame's foam, decayed, plus this
 * frame's fold of the cascade's Jacobian (the output texture's A). `decay`
 * and `injection` are `whitecapDecay` / `whitecapInjection` of the frame's
 * wave-time step, computed on the CPU, so a frozen clock adds nothing.
 */
export const WHITECAP_ACCUMULATE_FRAGMENT = `
  uniform sampler2D jacobian;
  uniform sampler2D previous;
  uniform float decay;
  uniform float injection;
  ${WHITECAP_FOAM_GLSL}

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float j = texelFetch(jacobian, p, 0).a;
    float foam = texelFetch(previous, p, 0).r;
    gl_FragColor = vec4(accumulateWhitecap(foam, j, decay, injection), 0.0, 0.0, 1.0);
  }
`;
