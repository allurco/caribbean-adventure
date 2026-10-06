import { describe, expect, it } from "vitest";
import { ShaderChunk } from "three";
import { WAVE_CASCADES } from "./oceanWaves";
import { injectSeabedCaustics } from "./seabedCaustics";
import { injectShoreFoam, LAND_FOAM_GLSL } from "./shoreFoamLand";
import { surfTimeUniform } from "./surfMotion";
import { createWrap } from "../../game/hex";

const SUN = [0.3, 0.8, 0.5] as const;
const BOUNDS = { minX: -1, maxX: 9, minZ: 0, maxZ: 5 };

/** A stand-in for three's MeshStandardMaterial sources, with the caustic patch already applied as in useLandTerrain. */
function causticShader() {
  const shader = {
    vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}",
    fragmentShader: "#include <common>\nvoid main() {\n#include <color_fragment>\n#include <lights_fragment_begin>\n#include <lights_fragment_end>\n}",
    uniforms: {} as Record<string, { value: unknown }>,
  };
  injectSeabedCaustics(shader, { sun: SUN, waveSlopes: WAVE_CASCADES.map((_, i) => ({ id: i })) });
  return shader;
}

describe("injectShoreFoam (the wash on the sand, #38 step 7)", () => {
  const texture = { id: "field" };

  it("carries the world position to the fragment shader", () => {
    const shader = causticShader();
    injectShoreFoam(shader, { texture, bounds: BOUNDS, wrap: null });
    expect(shader.vertexShader).toContain("varying vec3 vFoamWorld;");
    expect(shader.vertexShader).toContain("vFoamWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    expect(shader.fragmentShader).toContain("varying vec3 vFoamWorld;");
  });

  it("swaps the foam's albedo in for the land's after the vertex colour, so three lights it like the sand", () => {
    const shader = causticShader();
    injectShoreFoam(shader, { texture, bounds: BOUNDS, wrap: null });
    expect(shader.fragmentShader).toContain("#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, FOAM_ALBEDO, landFoam());");
    expect(ShaderChunk.meshphysical_frag).toContain("#include <color_fragment>");
  });

  it("binds the terrain field, its bounds and the shared surf clock", () => {
    const shader = causticShader();
    injectShoreFoam(shader, { texture, bounds: BOUNDS, wrap: null });
    expect(shader.uniforms.terrainField.value).toBe(texture);
    expect(shader.uniforms.mapBounds.value).toEqual([-1, 9, 0, 5]);
    expect(shader.uniforms.surfTime).toBe(surfTimeUniform);
  });

  it("wraps the field's x on a wrapping map", () => {
    const flat = causticShader();
    injectShoreFoam(flat, { texture, bounds: BOUNDS, wrap: null });
    expect(flat.fragmentShader).not.toContain("#define TERRAIN_FIELD_WRAP_X");
    const wrapped = causticShader();
    injectShoreFoam(wrapped, { texture, bounds: BOUNDS, wrap: createWrap(8) });
    expect(wrapped.fragmentShader).toContain("#define TERRAIN_FIELD_WRAP_X");
  });

  it("relies on the caustic patch's wave fades, so it must come after it", () => {
    const bare = {
      vertexShader: "#include <common>\nvoid main() {\n#include <project_vertex>\n}",
      fragmentShader: "#include <common>\nvoid main() {\n#include <color_fragment>\n}",
      uniforms: {},
    };
    expect(() => injectShoreFoam(bare, { texture, bounds: BOUNDS, wrap: null })).toThrow(/caustic/);
  });
});

describe("LAND_FOAM_GLSL", () => {
  it("draws the wash by the baked coast distance, only above the waterline, pulsed and laced like the water's", () => {
    expect(LAND_FOAM_GLSL).toContain("float coast = terrainFieldCoastDistance(texel);");
    expect(LAND_FOAM_GLSL).toContain("float pulse = surfPulse(vFoamWorld.xz, surfTime, 0.0);");
    expect(LAND_FOAM_GLSL).toContain("float coverage = beachWashBand(coast, pulse) * SHORE_FOAM_COVERAGE;");
    expect(LAND_FOAM_GLSL).toContain("coverage *= smoothstep(-FOAM_WATERLINE_SOFTNESS, 0.0, vFoamWorld.y);");
    expect(LAND_FOAM_GLSL).toContain("foamLace(coverage, foamBreakupNoise(vFoamWorld.xz, SHORE_FOAM_NOISE_SCALE, surfChurn(surfTime)))");
    expect(LAND_FOAM_GLSL).toContain("waveDetailFade(length(vFoamWorld - cameraPosition))");
  });
});
