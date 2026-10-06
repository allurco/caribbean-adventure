import { describe, expect, it } from "vitest";
import { WAVE_CASCADES, WAVE_SHADING_GAIN, WHITECAP_CASCADES } from "./oceanWaves";
import { METRES_PER_UNIT } from "./worldScale";
import { bindWaveSlopeTextures, bindWhitecapTextures, WAVE_SLOPE_GLSL } from "./waveSlopeGlsl";

describe("WAVE_SLOPE_GLSL (the cascade look-up shared by the water and the seabed)", () => {
  it("declares one slope sampler, tile size, turn and band start per cascade", () => {
    WAVE_CASCADES.forEach((c, i) => {
      expect(WAVE_SLOPE_GLSL).toContain(`uniform sampler2D waveSlopes${i};`);
      expect(WAVE_SLOPE_GLSL).toContain(`const float WAVE_TILE_UNITS_${i} = ${(c.tileMetres / METRES_PER_UNIT).toFixed(8)};`);
      expect(WAVE_SLOPE_GLSL).toContain(`const vec2 WAVE_TURN_${i} = vec2(${Math.cos(c.rotation).toFixed(8)}, ${Math.sin(c.rotation).toFixed(8)});`);
      expect(WAVE_SLOPE_GLSL).toContain(`const float WAVE_K_MIN_${i} = ${c.kMin.toFixed(8)};`);
      expect(WAVE_SLOPE_GLSL).toContain(`const float WAVE_K_MAX_${i} = ${c.kMax.toFixed(8)};`);
    });
    expect(WAVE_SLOPE_GLSL).toContain(`const int WAVE_CASCADE_COUNT = ${WAVE_CASCADES.length};`);
    expect(WAVE_SLOPE_GLSL).toContain(`const float WAVE_SHADING_GAIN = ${WAVE_SHADING_GAIN.toFixed(4)};`);
  });

  it("sums the cascades in one function that samples every texture unconditionally, each weighted by the caller, at the caller's mip bias", () => {
    expect(WAVE_SLOPE_GLSL).toContain(
      "void sumCascadeSlopes(vec2 worldXZ, float footprintMetres, float distanceFade, float weights[WAVE_CASCADE_COUNT], float lodBias, out vec2 slope, out float slopeVariance)"
    );
    WAVE_CASCADES.forEach((_, i) => {
      expect(WAVE_SLOPE_GLSL).toContain(`texture2D(waveSlopes${i}, uv, lodBias)`);
      expect(WAVE_SLOPE_GLSL).toContain(`weights[${i}]`);
    });
    // The normal filter it builds on (fades and LEAN roughness) comes with it.
    expect(WAVE_SLOPE_GLSL).toContain("void addCascadeSlope(vec3 texel, vec2 turn, float fade, inout vec2 slope, inout float variance)");
    expect(WAVE_SLOPE_GLSL).toContain("float cascadeLodFade(float footprintMetres, float kMin)");
  });

  it("binds one texture per cascade to the matching uniform", () => {
    const uniforms: Record<string, { value: unknown }> = {};
    const textures = WAVE_CASCADES.map((_, i) => ({ id: i }));
    bindWaveSlopeTextures(uniforms, textures);
    textures.forEach((t, i) => expect(uniforms[`waveSlopes${i}`].value).toBe(t));
  });

  it("refuses a texture count that does not match the cascades", () => {
    expect(() => bindWaveSlopeTextures({}, [{}])).toThrow(RangeError);
  });
});

describe("the whitecap look-up (#38 step 7)", () => {
  it("declares one accumulation sampler per whitecapping cascade", () => {
    WHITECAP_CASCADES.forEach((c) => expect(WAVE_SLOPE_GLSL).toContain(`uniform sampler2D waveWhitecaps${c};`));
    WAVE_CASCADES.forEach((_, i) => {
      if (!WHITECAP_CASCADES.includes(i)) expect(WAVE_SLOPE_GLSL).not.toContain(`waveWhitecaps${i}`);
    });
  });

  it("sums each cascade's foam through the same tile transform and fades as its slopes, saturating at 1", () => {
    expect(WAVE_SLOPE_GLSL).toContain(
      "float sumCascadeWhitecaps(vec2 worldXZ, float footprintMetres, float distanceFade, float weights[WAVE_CASCADE_COUNT])"
    );
    WHITECAP_CASCADES.forEach((c) => {
      expect(WAVE_SLOPE_GLSL).toContain(`foam += weights[${c}] * distanceFade * cascadeLodFade(footprintMetres, WAVE_K_MIN_${c}) * texture2D(waveWhitecaps${c}, cascadeTileUv(worldXZ, WAVE_TURN_${c}, WAVE_TILE_UNITS_${c})).r;`);
    });
    expect(WAVE_SLOPE_GLSL).toContain("return min(foam, 1.0);");
  });

  it("binds one accumulation texture per whitecapping cascade, in that order", () => {
    const uniforms: Record<string, { value: unknown }> = {};
    const textures = WHITECAP_CASCADES.map((c) => ({ id: c }));
    bindWhitecapTextures(uniforms, textures);
    WHITECAP_CASCADES.forEach((c, i) => expect(uniforms[`waveWhitecaps${c}`].value).toBe(textures[i]));
    expect(() => bindWhitecapTextures({}, [])).toThrow(RangeError);
  });
});
