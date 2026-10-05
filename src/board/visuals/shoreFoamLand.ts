/**
 * The shore wash on the sand (#38 step 7). The water's foam stops where the
 * land mesh rises above the waterline and covers the water plane, so on its
 * own the wash was cut off at the island's edge. The land material therefore
 * draws the same wash up the beach: by the baked coast distance
 * (shoreFoam.ts `beachWashBand`), on the same surf clock, with the same
 * lace, only above the waterline (below it the water's wash takes over),
 * fading with distance like the waves.
 *
 * Like the caustics (seabedCaustics.ts) this patches three's standard
 * material from `onBeforeCompile`, and it is applied after the caustic patch
 * on the same material (useLandTerrain.ts): it reuses that patch's wave
 * fades (`waveDetailFade`, `cascadeLodFade`). The foam is put in as the
 * fragment's diffuse albedo right after the vertex colour, so three's own
 * lighting (sun with shadows, caustic-focused; sky) shades it exactly as
 * it shades the sand: a rough, opaque, diffuse layer, which is what foam is.
 */
import type { MapWrap } from "../../game/hex";
import { FOAM_MOTION_GLSL, FOAM_SHADING_GLSL } from "./foamShading";
import { SHORE_FOAM_GLSL } from "./shoreFoam";
import { SURF_TIMING_GLSL, surfTimeUniform } from "./surfMotion";
import { TERRAIN_FIELD_GLSL } from "./terrainFieldTexture";
import type { TerrainBounds } from "./terrainHeightField";
import { METRES_PER_UNIT } from "./worldScale";

/** World units below sea level over which the land's foam fades in, so the waterline has no hard edge. */
export const FOAM_WATERLINE_SOFTNESS = 0.004;

/** Fragment-shader declarations and `landFoam()`. */
export const LAND_FOAM_GLSL = `
  uniform sampler2D terrainField;
  uniform vec4 mapBounds; // minX, maxX, minZ, maxZ
  uniform float surfTime; // seconds, wrapped on the CPU (surfMotion.ts)
  varying vec3 vFoamWorld;
  const float FOAM_METRES_PER_UNIT = ${METRES_PER_UNIT.toFixed(1)};
  const float FOAM_WATERLINE_SOFTNESS = ${FOAM_WATERLINE_SOFTNESS.toFixed(4)};
  ${TERRAIN_FIELD_GLSL}
  ${SURF_TIMING_GLSL}
  ${FOAM_MOTION_GLSL}
  ${FOAM_SHADING_GLSL}
  ${SHORE_FOAM_GLSL}

  // Foam coverage on this land fragment: the wash up the sand.
  float landFoam() {
    vec2 fieldUv = terrainFieldUv(vFoamWorld.xz);
    vec4 texel = texture2D(terrainField, fieldUv);
    if (!terrainFieldInside(fieldUv)) return 0.0;
    float coast = terrainFieldCoastDistance(texel);
    float pulse = surfPulse(vFoamWorld.xz, surfTime, 0.0);
    float coverage = beachWashBand(coast, pulse) * SHORE_FOAM_COVERAGE;
    // Only above the waterline: the submerged shoreline triangles are seabed.
    coverage *= smoothstep(-FOAM_WATERLINE_SOFTNESS, 0.0, vFoamWorld.y);
    float footprintMetres = max(length(dFdx(vFoamWorld.xz)), length(dFdy(vFoamWorld.xz))) * FOAM_METRES_PER_UNIT;
    float detail = foamDetailFade(footprintMetres, SHORE_FOAM_LACE_METRES);
    float lace = foamLace(coverage, foamBreakupNoise(vFoamWorld.xz, SHORE_FOAM_NOISE_SCALE, surfChurn(surfTime)));
    return mix(coverage * FOAM_FAR_SHARE, lace, detail) * waveDetailFade(length(vFoamWorld - cameraPosition));
  }
`;

const VERTEX_DECLARATIONS = `
  varying vec3 vFoamWorld;`;

const VERTEX_BODY = `
  vFoamWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

export interface ShoreFoamShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

export interface ShoreFoamOptions<T> {
  /** The map's terrain field texture (useTerrainFieldTexture). */
  texture: T;
  /** The world xz extent it covers. */
  bounds: TerrainBounds;
  /** The map's east–west wrap: with one the field repeats every wrap width. */
  wrap: MapWrap;
}

/**
 * Patches a built-in material's shaders (from `onBeforeCompile`, after
 * `injectSeabedCaustics`) so the shore wash runs up the sand, and binds the
 * field and the shared surf clock.
 */
export function injectShoreFoam<T>(shader: ShoreFoamShader, { texture, bounds, wrap }: ShoreFoamOptions<T>): void {
  if (!shader.fragmentShader.includes("float waveDetailFade(")) {
    throw new Error("injectShoreFoam must follow the caustic patch (injectSeabedCaustics), whose wave fades it reuses.");
  }
  shader.uniforms.terrainField = { value: texture };
  shader.uniforms.mapBounds = { value: [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ] };
  shader.uniforms.surfTime = surfTimeUniform;
  const wrapDefine = wrap ? "\n#define TERRAIN_FIELD_WRAP_X" : "";
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>${VERTEX_DECLARATIONS}`)
    .replace("#include <project_vertex>", `#include <project_vertex>${VERTEX_BODY}`);
  // Declared just before main, after the caustic patch's GLSL it builds on.
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", `${wrapDefine}${LAND_FOAM_GLSL}\nvoid main() {`)
    .replace("#include <color_fragment>", "#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, FOAM_ALBEDO, landFoam());");
}
