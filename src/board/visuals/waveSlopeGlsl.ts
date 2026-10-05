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
 */
import { WAVE_CASCADES, WAVE_SHADING_GAIN } from "./oceanWaves";
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

/** One cascade's filtered look-up, unrolled so each texture is sampled by name. */
const CASCADE_SUM = WAVE_CASCADES.map(
  (_, i) => `
    {
      vec2 t = WAVE_TURN_${i};
      vec2 p = worldXZ / WAVE_TILE_UNITS_${i};
      vec2 uv = vec2(t.x * p.x + t.y * p.y, -t.y * p.x + t.x * p.y); // Rᵀ · p
      float fade = weights[${i}] * distanceFade * cascadeLodFade(footprintMetres, WAVE_K_MIN_${i});
      addCascadeSlope(texture2D(waveSlopes${i}, uv, lodBias).xyz, t, fade, slope, slopeVariance);
    }`
).join("");

export const WAVE_SLOPE_GLSL = `
  const int WAVE_CASCADE_COUNT = ${WAVE_CASCADES.length};
  // Gain on the drawn slopes for shading and refraction (oceanWaves.ts).
  const float WAVE_SHADING_GAIN = ${WAVE_SHADING_GAIN.toFixed(4)};
  ${CASCADE_DECLARATIONS}
  ${WAVE_NORMAL_FILTER_GLSL}

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
