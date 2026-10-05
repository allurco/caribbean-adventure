/**
 * Caustics on the seabed (#38 step 6): the seabed material's sunlight is
 * focused through the wave surface above it, in the seabed prepass, with no
 * extra pass. The maths is in causticFocus.ts; this file is the GLSL that
 * applies it and the patch that puts it into three's standard material.
 *
 * Per seabed fragment: find the surface point the sun's refracted ray
 * crosses to reach it (the seabed point moved up and back along the
 * refracted sun direction by its depth), sample the summed wave slope there
 * and one footprint step away along each screen axis (the shared cascade
 * look-up, waveSlopeGlsl.ts, read a few mip levels coarser so that waves too
 * short to draw as lines are smoothed out, causticFocus.ts), turn the
 * differences into the wave Hessian, and scale the sun's light by
 * 1 / |det(I + depth · G · H)|. The three look-ups per cascade are per
 * fragment, so the lines are not blocky the way dFdx of a sampled slope
 * (constant per 2×2 quad) would be. Only the directional light is scaled:
 * the sky's light reaches the seabed diffusely and is not focused.
 * Beer–Lambert is applied afterwards by the water shader, as before.
 *
 * Caustics move with the wave textures themselves, so they share the wave
 * clock and freeze with the waves under prefers-reduced-motion.
 */
import { ShaderChunk } from "three";
import { CAUSTIC_FOCUS_GLSL, refractedSunTravel, refractionFocusMatrix } from "./causticFocus";
import type { Vec3 } from "./sunDirection";
import { WAVE_CASCADES } from "./oceanWaves";
import { WAVE_DETAIL_FADE_END } from "./waveNormalFilter";
import { bindWaveSlopeTextures, WAVE_SLOPE_GLSL } from "./waveSlopeGlsl";
import { METRES_PER_UNIT } from "./worldScale";

/** Per-cascade weights: each band's depth fade times its level-of-detail fade. */
const CASCADE_WEIGHTS = WAVE_CASCADES.map(
  (_, i) => `
    weights[${i}] = causticDepthFade(depthMetres, WAVE_K_MIN_${i}, WAVE_K_MAX_${i}) * causticLodFade(footprintMetres, WAVE_K_MIN_${i});`
).join("");

/** Fragment-shader declarations and `seabedCaustic()`; needs `<common>` for nothing but is placed after it. */
export const SEABED_CAUSTIC_GLSL = `
  uniform vec2 causticSunTravel; // horizontal travel per unit depth of the refracted sun ray (refractedSunTravel)
  uniform mat2 causticFocus;     // ∂ travel / ∂ slope at a level sea (refractionFocusMatrix)
  varying vec3 vCausticWorld;
  const float CAUSTIC_METRES_PER_UNIT = ${METRES_PER_UNIT.toFixed(1)};
  const float CAUSTIC_DETAIL_FADE_END = ${WAVE_DETAIL_FADE_END.toFixed(1)};
  ${WAVE_SLOPE_GLSL}
  ${CAUSTIC_FOCUS_GLSL}

  // Factor on the sun's light at this seabed fragment: 1 under a flat sea.
  // Every texture look-up is unconditional; call from the top of main.
  float seabedCaustic() {
    float depthUnits = max(-vCausticWorld.y, 0.0);
    float depthMetres = depthUnits * CAUSTIC_METRES_PER_UNIT;
    vec2 surface = vCausticWorld.xz - causticSunTravel * depthUnits;
    // The prepass texel's footprint on the seabed, widened to the smoothed
    // look-up's; the surface point moves with the seabed point, so it is the
    // footprint on the surface too.
    vec2 stepX = dFdx(vCausticWorld.xz) * CAUSTIC_STEP_SCALE;
    vec2 stepZ = dFdy(vCausticWorld.xz) * CAUSTIC_STEP_SCALE;
    float footprintMetres = max(length(stepX), length(stepZ)) * CAUSTIC_METRES_PER_UNIT;
    float distanceFade = waveDetailFade(length(vCausticWorld - cameraPosition));
    float weights[WAVE_CASCADE_COUNT];${CASCADE_WEIGHTS}
    vec2 slope, slopeX, slopeZ;
    float variance;
    sumCascadeSlopes(surface, footprintMetres, distanceFade, weights, CAUSTIC_LOD_BIAS, slope, variance);
    sumCascadeSlopes(surface + stepX, footprintMetres, distanceFade, weights, CAUSTIC_LOD_BIAS, slopeX, variance);
    sumCascadeSlopes(surface + stepZ, footprintMetres, distanceFade, weights, CAUSTIC_LOD_BIAS, slopeZ, variance);
    mat2 hessian = hessianFromSlopeDifferences((slopeX - slope) * WAVE_SHADING_GAIN, (slopeZ - slope) * WAVE_SHADING_GAIN, stepX, stepZ);
    return causticIntensity(causticJacobianDeterminant(depthUnits, causticFocus, hessian));
  }
`;

const VERTEX_DECLARATIONS = `
  varying vec3 vCausticWorld;`;

const VERTEX_BODY = `
  vCausticWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

/** Three's lights chunk with the directional light's colour scaled by the caustic as it is read. */
const LIGHTS_WITH_CAUSTIC = ShaderChunk.lights_fragment_begin.replace(
  "getDirectionalLightInfo( directionalLight, directLight );",
  "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= causticFactor;"
);

export interface SeabedCausticShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

export interface SeabedCausticOptions<T> {
  /** Unit vector toward the sun (the scene's SUN_DIRECTION). */
  sun: Vec3;
  /** The cascades' slope textures (useWaveCascades), one per cascade. */
  waveSlopes: readonly T[];
}

/**
 * Patches a built-in material's shaders (from `onBeforeCompile`) so its
 * directional light is focused by the waves, and binds the uniforms. The sun
 * is fixed, so its refraction constants are computed here, once.
 */
export function injectSeabedCaustics<T>(shader: SeabedCausticShader, { sun, waveSlopes }: SeabedCausticOptions<T>): void {
  const focus = refractionFocusMatrix(sun);
  shader.uniforms.causticSunTravel = { value: refractedSunTravel(sun) };
  // mat2 uniforms upload column-major.
  shader.uniforms.causticFocus = { value: [focus[0][0], focus[1][0], focus[0][1], focus[1][1]] };
  bindWaveSlopeTextures(shader.uniforms, waveSlopes);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>${VERTEX_DECLARATIONS}`)
    .replace("#include <project_vertex>", `#include <project_vertex>${VERTEX_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>${SEABED_CAUSTIC_GLSL}`)
    .replace("#include <lights_fragment_begin>", `float causticFactor = seabedCaustic();\n${LIGHTS_WITH_CAUSTIC}`);
}
