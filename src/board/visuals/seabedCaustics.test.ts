import { describe, expect, it } from "vitest";
import { ShaderChunk } from "three";
import { WAVE_CASCADES } from "./oceanWaves";
import { refractedSunTravel, refractionFocusMatrix } from "./causticFocus";
import { injectSeabedCaustics, SEABED_CAUSTIC_GLSL, SUN_CAUSTIC_MULTIPLY } from "./seabedCaustics";

const SUN = [0.3, 0.8, 0.5] as const;

/** A stand-in for three's MeshStandardMaterial sources: just the anchors the patch needs. */
function shaderStub() {
  return {
    vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}",
    fragmentShader: "#include <common>\nvoid main() {\n#include <lights_fragment_begin>\n#include <lights_fragment_end>\n}",
    uniforms: {} as Record<string, { value: unknown }>,
  };
}

describe("injectSeabedCaustics", () => {
  const textures = WAVE_CASCADES.map((_, i) => ({ id: i }));

  it("carries the world position to the fragment shader", () => {
    const shader = shaderStub();
    injectSeabedCaustics(shader, { sun: SUN, waveSlopes: textures });
    expect(shader.vertexShader).toContain("varying vec3 vCausticWorld;");
    expect(shader.vertexShader).toContain("vCausticWorld = (modelMatrix * causticLocal).xyz;");
    expect(shader.fragmentShader).toContain("varying vec3 vCausticWorld;");
  });

  it("applies the instance matrix before the model matrix on instanced meshes (three's `transformed` is not instance-transformed)", () => {
    const shader = shaderStub();
    injectSeabedCaustics(shader, { sun: SUN, waveSlopes: textures });
    const body = shader.vertexShader.slice(shader.vertexShader.indexOf("#include <project_vertex>"));
    expect(body).toContain("vec4 causticLocal = vec4(transformed, 1.0);");
    expect(body).toContain("#ifdef USE_INSTANCING\n  causticLocal = instanceMatrix * causticLocal;\n  #endif");
    // Instance first, then model, then the varying: the non-instanced path is unchanged.
    const instanceAt = body.indexOf("causticLocal = instanceMatrix * causticLocal;");
    const worldAt = body.indexOf("vCausticWorld = (modelMatrix * causticLocal).xyz;");
    expect(instanceAt).toBeGreaterThan(0);
    expect(instanceAt).toBeLessThan(worldAt);
  });

  it("scales only the sun by the caustic, before three's shading, leaving the sky term alone", () => {
    const shader = shaderStub();
    injectSeabedCaustics(shader, { sun: SUN, waveSlopes: textures });
    // The lights chunk is inlined with the sun's colour scaled right after it is read.
    expect(shader.fragmentShader).not.toContain("#include <lights_fragment_begin>");
    expect(shader.fragmentShader).toContain(`getDirectionalLightInfo( directionalLight, directLight );\n\t\t${SUN_CAUSTIC_MULTIPLY}`);
    // Point and spot lights, and the indirect (sky) terms, are untouched.
    expect(shader.fragmentShader).toContain("getPointLightInfo( pointLight, geometryPosition, directLight );\n");
    expect(shader.fragmentShader).not.toContain("getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\t#if UNROLLED_LOOP_INDEX");
    expect(shader.fragmentShader).toContain("#include <lights_fragment_end>");
    // The caustic is computed before the lights, in uniform control flow.
    const factorAt = shader.fragmentShader.indexOf("float causticFactor = seabedCaustic();");
    const lightsAt = shader.fragmentShader.indexOf("IncidentLight directLight;");
    expect(factorAt).toBeGreaterThan(0);
    expect(factorAt).toBeLessThan(lightsAt);
  });

  it("only patches what three's chunk contains", () => {
    expect(ShaderChunk.lights_fragment_begin).toContain("getDirectionalLightInfo( directionalLight, directLight );");
  });

  it("guards the multiply to directional light 0, the shadow-casting sun, so the fill light (#63) is not focused", () => {
    const shader = shaderStub();
    injectSeabedCaustics(shader, { sun: SUN, waveSlopes: textures });
    // The multiply sits inside the unrolled loop, where three substitutes the
    // literal index for UNROLLED_LOOP_INDEX (it guards its own shadow read with it).
    // Point and spot lights unroll first in three's chunk; find the directional loop by its header.
    const loopStart = shader.fragmentShader.indexOf("for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ )");
    const loopEnd = shader.fragmentShader.indexOf("#pragma unroll_loop_end", loopStart);
    const multiplyAt = shader.fragmentShader.indexOf("directLight.color *= causticFactor;");
    expect(multiplyAt).toBeGreaterThan(loopStart);
    expect(multiplyAt).toBeLessThan(loopEnd);
    const guarded = shader.fragmentShader.slice(loopStart, loopEnd);
    expect(guarded).toMatch(/#if UNROLLED_LOOP_INDEX == 0\n\s*directLight\.color \*= causticFactor;[^\n]*\n\s*#endif/);
    // The guard uses the same token three uses for its own per-index guard, so it is substituted the same way.
    expect(ShaderChunk.lights_fragment_begin).toContain("UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS");
    // Only one multiply: the fill light is never scaled.
    expect(shader.fragmentShader.split("directLight.color *= causticFactor;").length - 1).toBe(1);
  });

  it("binds the cascade textures and the sun's refraction constants as uniforms", () => {
    const shader = shaderStub();
    injectSeabedCaustics(shader, { sun: SUN, waveSlopes: textures });
    textures.forEach((t, i) => expect(shader.uniforms[`waveSlopes${i}`].value).toBe(t));
    expect(shader.uniforms.causticSunTravel.value).toEqual(refractedSunTravel(SUN));
    // mat2 uniforms upload column-major.
    const g = refractionFocusMatrix(SUN);
    expect(shader.uniforms.causticFocus.value).toEqual([g[0][0], g[1][0], g[0][1], g[1][1]]);
  });
});

describe("SEABED_CAUSTIC_GLSL", () => {
  it("samples the smoothed surface at the refracted sun's crossing and one smoothed-footprint step along each screen axis", () => {
    expect(SEABED_CAUSTIC_GLSL).toContain("vec2 surface = vCausticWorld.xz - causticSunTravel * depthUnits;");
    expect(SEABED_CAUSTIC_GLSL).toContain("vec2 stepX = dFdx(vCausticWorld.xz) * CAUSTIC_STEP_SCALE;");
    expect(SEABED_CAUSTIC_GLSL).toContain("vec2 stepZ = dFdy(vCausticWorld.xz) * CAUSTIC_STEP_SCALE;");
    expect(SEABED_CAUSTIC_GLSL).toContain("sumCascadeSlopes(surface, footprintMetres, distanceFade, weights, CAUSTIC_LOD_BIAS, slope, variance);");
    expect(SEABED_CAUSTIC_GLSL).toContain("sumCascadeSlopes(surface + stepX, footprintMetres, distanceFade, weights, CAUSTIC_LOD_BIAS, slopeX, variance);");
    expect(SEABED_CAUSTIC_GLSL).toContain("sumCascadeSlopes(surface + stepZ, footprintMetres, distanceFade, weights, CAUSTIC_LOD_BIAS, slopeZ, variance);");
  });

  it("weights each cascade by its depth and level-of-detail fades", () => {
    WAVE_CASCADES.forEach((_, i) => {
      expect(SEABED_CAUSTIC_GLSL).toContain(
        `weights[${i}] = causticDepthFade(depthMetres, WAVE_K_MIN_${i}, WAVE_K_MAX_${i}) * causticLodFade(footprintMetres, WAVE_K_MIN_${i});`
      );
    });
  });

  it("applies the shading gain to the slopes the Hessian is built from, as the water's refraction does", () => {
    expect(SEABED_CAUSTIC_GLSL).toContain("(slopeX - slope) * WAVE_SHADING_GAIN");
    expect(SEABED_CAUSTIC_GLSL).toContain("(slopeZ - slope) * WAVE_SHADING_GAIN");
  });
});
