/**
 * The wave cascades' slope look-up as GLSL (#38 steps 5–6), shared by the
 * water shader (Ocean.tsx), which shades the surface with it, and the seabed
 * caustics (seabedCaustics.ts), which read the surface above the seabed. One
 * source, so the two always see the same sea.
 *
 * The caller supplies the uniforms `waveSlopes0 … N−1` (bindWaveSlopeTextures)
 * and calls `sumCascadeSlopes`, which samples every cascade unconditionally,
 * so the look-ups stay in uniform control flow wherever it is called from
 * the top of `main`.
 *
 * The whitecaps (#38 step 7) are read the same way: `waveWhitecaps<c>` for
 * each whitecapping cascade (bindWhitecapTextures) holds that cascade's
 * accumulated foam in its own tile space, and `sumCascadeWhitecaps` sums them
 * through the same tile transform and fades as the slopes.
 */
import { WAVE_CASCADES, WAVE_SHADING_GAIN, WHITECAP_CASCADES } from "./oceanWaves";
import { WAVE_NORMAL_FILTER_GLSL } from "./waveNormalFilter";
import { METRES_PER_UNIT } from "./worldScale";

const glslFloat = (x: number) => x.toFixed(8);

/** Per-cascade uniforms and constants: tile size in world units, turn (cos, sin), band start. */
const CASCADE_DECLARATIONS = WAVE_CASCADES.map(
  (c, i) => `
  uniform sampler2D waveSlopes${i};
  const float WAVE_TILE_UNITS_${i} = ${glslFloat(c.tileMetres / METRES_PER_UNIT)};
  const vec2 WAVE_TURN_${i} = vec2(${glslFloat(Math.cos(c.rotation))}, ${glslFloat(Math.sin(c.rotation))});
  const float WAVE_K_MIN_${i} = ${glslFloat(c.kMin)};
  const float WAVE_K_MAX_${i} = ${glslFloat(c.kMax)};`
).join("");

const WHITECAP_DECLARATIONS = WHITECAP_CASCADES.map(
  (c) => `
  uniform sampler2D waveWhitecaps${c};`
).join("");

/** One cascade's filtered look-up, unrolled so each texture is sampled by name. */
const CASCADE_SUM = WAVE_CASCADES.map(
  (_, i) => `
    {
      vec2 uv = cascadeTileUv(worldXZ, WAVE_TURN_${i}, WAVE_TILE_UNITS_${i});
      float fade = weights[${i}] * distanceFade * cascadeLodFade(footprintMetres, WAVE_K_MIN_${i});
      addCascadeSlope(texture2D(waveSlopes${i}, uv, lodBias).xyz, WAVE_TURN_${i}, fade, slope, slopeVariance);
    }`
).join("");

const WHITECAP_SUM = WHITECAP_CASCADES.map(
  (c) => `
    foam += weights[${c}] * distanceFade * cascadeLodFade(footprintMetres, WAVE_K_MIN_${c}) * texture2D(waveWhitecaps${c}, cascadeTileUv(worldXZ, WAVE_TURN_${c}, WAVE_TILE_UNITS_${c})).r;`
).join("");

export const WAVE_SLOPE_GLSL = `
  const int WAVE_CASCADE_COUNT = ${WAVE_CASCADES.length};
  // Gain on the drawn slopes for shading and refraction (oceanWaves.ts).
  const float WAVE_SHADING_GAIN = ${WAVE_SHADING_GAIN.toFixed(4)};
  ${CASCADE_DECLARATIONS}
  ${WHITECAP_DECLARATIONS}
  ${WAVE_NORMAL_FILTER_GLSL}

  // Where worldXZ falls on a cascade's tile: turned by Rᵀ into the tile's axes, in tiles.
  vec2 cascadeTileUv(vec2 worldXZ, vec2 turn, float tileUnits) {
    vec2 p = worldXZ / tileUnits;
    return vec2(turn.x * p.x + turn.y * p.y, -turn.y * p.x + turn.x * p.y);
  }

  // The sea's slope at worldXZ (world axes) and the slope variance the
  // look-ups left out, summed over the cascades: each is filtered to the
  // caller's footprint (coarser by \`lodBias\` mip levels; 0 for the pixel's
  // own), faded by \`distanceFade\`, by its own level of detail and by the
  // caller's \`weights\`.
  void sumCascadeSlopes(vec2 worldXZ, float footprintMetres, float distanceFade, float weights[WAVE_CASCADE_COUNT], float lodBias, out vec2 slope, out float slopeVariance) {
    slope = vec2(0.0);
    slopeVariance = 0.0;
    ${CASCADE_SUM}
  }

  // The whitecap coverage at worldXZ, 0 … 1: each whitecapping cascade's
  // accumulated foam, filtered to the pixel, with the same fades as its
  // slopes, so a band that is faded out foams nothing.
  float sumCascadeWhitecaps(vec2 worldXZ, float footprintMetres, float distanceFade, float weights[WAVE_CASCADE_COUNT]) {
    float foam = 0.0;
    ${WHITECAP_SUM}
    return min(foam, 1.0);
  }
`;

/** Attaches cascade `i`'s slope texture to the uniform \`waveSlopes${i}\`. */
export function bindWaveSlopeTextures<T>(uniforms: Record<string, { value: unknown }>, textures: readonly T[]): void {
  if (textures.length !== WAVE_CASCADES.length) {
    throw new RangeError(`${textures.length} slope textures for ${WAVE_CASCADES.length} cascades.`);
  }
  textures.forEach((texture, i) => {
    uniforms[`waveSlopes${i}`] = { value: texture };
  });
}

/**
 * Attaches the whitecap accumulation textures, one per entry of
 * WHITECAP_CASCADES in that order, to the uniforms \`waveWhitecaps<c>\`.
 */
export function bindWhitecapTextures<T>(uniforms: Record<string, { value: unknown }>, textures: readonly T[]): void {
  if (textures.length !== WHITECAP_CASCADES.length) {
    throw new RangeError(`${textures.length} whitecap textures for ${WHITECAP_CASCADES.length} whitecapping cascades.`);
  }
  textures.forEach((texture, i) => {
    uniforms[`waveWhitecaps${WHITECAP_CASCADES[i]}`] = { value: texture };
  });
}
