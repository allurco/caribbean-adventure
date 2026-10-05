import { describe, expect, it } from "vitest";
import { WAVE_CASCADES, WAVE_SHADING_GAIN } from "./oceanWaves";
import { METRES_PER_UNIT } from "./worldScale";
import { bindWaveSlopeTextures, WAVE_SLOPE_GLSL } from "./waveSlopeGlsl";

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
