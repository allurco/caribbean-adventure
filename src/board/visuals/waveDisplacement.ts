/**
 * Displacing the sea surface (#38 step 8). Pure maths, mirrored in GLSL by
 * `WAVE_DISPLACEMENT_GLSL`, which the water's vertex stage (Ocean.tsx) and
 * the grid lines that float on it (hexOutlineMaterial.ts) run per vertex.
 *
 * Which cascades move the geometry. The swell and the chop
 * (DISPLACEMENT_CASCADES): between them they carry over 99% of the sea's
 * height variance; the ripple band's waves are 0.4–3.2 m long and a few
 * centimetres high, under a pixel at any zoom, so it keeps contributing
 * normals only. Each displacing cascade's FFT writes a second texture of
 * (h, Dx, Dz) in metres in its tile's axes (waveCascade.ts,
 * waveCascadeShaders.ts): the height and the choppy pull toward the crests
 * with the same λ (WAVE_CHOPPINESS) that decides where the whitecaps fold,
 * so the sharpened crests and the foam on them agree.
 *
 * Amplitude. The height is drawn as it is (WAVE_HEIGHT_GAIN = 1): the
 * trade-wind sea's significant height is ~1.6 m, of which the displaced
 * bands hold ~1.5 m (DISPLACED_SIGNIFICANT_HEIGHT_METRES), 0.023 world units
 * at 65 m per unit; a crest a significant height above the mean
 * (WAVE_CREST_BOUND_UNITS) is a one-in-thousands wave, so it bounds the
 * geometry for culling and the shadow range. At the closest ship zoom
 * (~0.003 units per pixel) typical crests move the surface 2–4 pixels: the
 * water laps a static hull, as it would round a ship that is not yet heaving
 * (step 11). No stylistic gain was needed.
 *
 * Sampling. A vertex reads each texture with an explicit mip level
 * (`displacementLod`) chosen from its grid cell so waves shorter than about
 * two cells, which the mesh cannot carry, are averaged away instead of
 * aliasing; past that, a band whose longest wave spans under four cells
 * fades out as it does for the normals (`cascadeLodFade`), and everything
 * fades to flat with distance from the camera like the normals
 * (`waveDetailFade`). Vertices that two level-of-detail rings share carry
 * the finer ring's cell (oceanGrid.ts), so both rings sample them alike and
 * the stitched mesh stays watertight.
 *
 * Shallows. The displacement is scaled by `shallowDisplacementDamping` of
 * the seabed's depth from the terrain field: full seaward of twice the
 * breaking depth (shoreFoam.ts, McCowan: ~4 m here), a smoothstep down to
 * nothing at the waterline and on land. Shoreward of the breaker line the
 * real sea is a broken bore whose height is bounded by the depth; the test
 * checks the damped significant height stays under the depth all the way
 * in, so a trough never reaches the sand and the surface never lifts over
 * the beach. The shore foam bands are drawn from the seabed's rest depth
 * (Ocean.tsx), so they stay on their contours while the surface heaves.
 */
import { WAVE_CASCADES } from "./oceanWaves";
import { BREAKING_DEPTH_METRES } from "./shoreFoam";
import { TERRAIN_FIELD_GLSL } from "./terrainFieldTexture";
import { resolvedHeightVariance } from "./waveCascade";
import { WAVE_NORMAL_FILTER_GLSL } from "./waveNormalFilter";
import { CASCADE_TILE_GLSL } from "./waveSlopeGlsl";
import { METRES_PER_UNIT, metresToUnits } from "./worldScale";

/** Indices into WAVE_CASCADES of the cascades that displace the geometry: the swell and the chop. */
export const DISPLACEMENT_CASCADES: readonly number[] = [0, 1];

/** Gain on the drawn wave height. 1: the physical height at the render scale. */
export const WAVE_HEIGHT_GAIN = 1;

/** Depth at which the displacement is full, as a multiple of the sea's breaking depth. */
export const DISPLACEMENT_FULL_DEPTH_FACTOR = 2;
export const DISPLACEMENT_FULL_DEPTH_METRES = DISPLACEMENT_FULL_DEPTH_FACTOR * BREAKING_DEPTH_METRES;

/**
 * Mip levels added to log2(cell / texel) when a vertex reads a displacement
 * texture: a mip texel ~1.4 cells wide, so waves near the mesh's Nyquist
 * wavelength are averaged away rather than aliased.
 */
export const DISPLACEMENT_LOD_BIAS = 0.5;

/** Height variance the displacing cascades carry between them, m². */
export const DISPLACED_HEIGHT_VARIANCE = DISPLACEMENT_CASCADES.reduce(
  (sum, i) => sum + resolvedHeightVariance(WAVE_CASCADES[i]),
  0
);

/** Significant height of the displaced sea, 4 √variance: ~1.5 m. */
export const DISPLACED_SIGNIFICANT_HEIGHT_METRES = 4 * Math.sqrt(DISPLACED_HEIGHT_VARIANCE);

/**
 * Bound on how far the surface is drawn above or below sea level, world
 * units: a crest the significant height above the mean. Used to pad the
 * grid's culling bounds and checked against the shadow box's depth range.
 */
export const WAVE_CREST_BOUND_UNITS = metresToUnits(DISPLACED_SIGNIFICANT_HEIGHT_METRES * WAVE_HEIGHT_GAIN);

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Share of the displacement drawn over a seabed `depthMetres` down (≤ 0: land). */
export function shallowDisplacementDamping(depthMetres: number): number {
  return smoothstep(0, DISPLACEMENT_FULL_DEPTH_METRES, depthMetres);
}

/** Mip level a vertex on a grid of `cellMetres` reads a texture of `texelMetres` at. */
export function displacementLod(cellMetres: number, texelMetres: number): number {
  return Math.max(0, Math.log2(cellMetres / texelMetres) + DISPLACEMENT_LOD_BIAS);
}

/** A horizontal displacement in a tile's axes, turned into the world's by the tile's `rotation`. */
export function turnDisplacementToWorld(
  [dx, dz]: readonly [number, number],
  rotation: number
): [number, number] {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [c * dx - s * dz, s * dx + c * dz];
}

const glslFloat = (x: number) => x.toFixed(8);

const DISPLACEMENT_DECLARATIONS = DISPLACEMENT_CASCADES.map((c) => {
  const cascade = WAVE_CASCADES[c];
  return `
  uniform sampler2D waveDisplacement${c};
  const float WAVE_DISP_TILE_UNITS_${c} = ${glslFloat(cascade.tileMetres / METRES_PER_UNIT)};
  const float WAVE_DISP_TEXEL_METRES_${c} = ${glslFloat(cascade.tileMetres / cascade.size)};
  const float WAVE_DISP_K_MIN_${c} = ${glslFloat(cascade.kMin)};
  const vec2 WAVE_DISP_TURN_${c} = vec2(${glslFloat(Math.cos(cascade.rotation))}, ${glslFloat(Math.sin(cascade.rotation))});`;
}).join("");

/** One cascade's read, unrolled so each texture is sampled by name. */
const DISPLACEMENT_SUM = DISPLACEMENT_CASCADES.map(
  (c) => `
    {
      vec2 uv = cascadeTileUv(restXZ, WAVE_DISP_TURN_${c}, WAVE_DISP_TILE_UNITS_${c});
      vec3 t = textureLod(waveDisplacement${c}, uv, displacementLod(cellMetres, WAVE_DISP_TEXEL_METRES_${c})).xyz;
      addCascadeDisplacement(t, WAVE_DISP_TURN_${c}, cascadeLodFade(cellMetres, WAVE_DISP_K_MIN_${c}), d);
    }`
).join("");

/**
 * Vertex-stage GLSL: the uniforms `waveDisplacement<c>`
 * (bindWaveDisplacementTextures), the terrain field (`terrainField`,
 * `mapBounds`; define TERRAIN_FIELD_WRAP_X on a wrapping map) and
 * `waveSurfaceDisplacement`, the world-unit offset of the surface from its
 * rest point. Self-contained: it declares the field and the fade helpers, so
 * a stage that pastes it must not declare them again (the water's fragment
 * stage is a separate stage and does).
 */
export const WAVE_DISPLACEMENT_GLSL = `
  uniform sampler2D terrainField;
  uniform vec4 mapBounds; // minX, maxX, minZ, maxZ
  ${TERRAIN_FIELD_GLSL}
  ${CASCADE_TILE_GLSL}
  ${WAVE_NORMAL_FILTER_GLSL}
  const float WAVE_DISP_METRES_PER_UNIT = ${METRES_PER_UNIT.toFixed(1)};
  const float WAVE_HEIGHT_GAIN = ${WAVE_HEIGHT_GAIN.toFixed(4)};
  const float DISPLACEMENT_FULL_DEPTH_METRES = ${DISPLACEMENT_FULL_DEPTH_METRES.toFixed(4)};
  const float DISPLACEMENT_LOD_BIAS = ${DISPLACEMENT_LOD_BIAS.toFixed(4)};
  // Off the field there is no seabed within reach: open sea.
  const float DISPLACEMENT_DEEP_METRES = 1000.0;
  ${DISPLACEMENT_DECLARATIONS}

  float shallowDisplacementDamping(float depthMetres) {
    return smoothstep(0.0, DISPLACEMENT_FULL_DEPTH_METRES, depthMetres);
  }
  float displacementLod(float cellMetres, float texelMetres) {
    return max(0.0, log2(cellMetres / texelMetres) + DISPLACEMENT_LOD_BIAS);
  }
  // Adds one cascade's (h, Dx, Dz) texel, metres in its tile's axes, turned
  // into the world's (x, y, z) like the slopes (waveNormalFilter.ts).
  void addCascadeDisplacement(vec3 t, vec2 turn, float fade, inout vec3 d) {
    d += fade * vec3(turn.x * t.y - turn.y * t.z, t.x, turn.y * t.y + turn.x * t.z);
  }

  // How far the surface at rest point restXZ (sea level) is displaced, world
  // units, for a vertex on a grid of \`cellUnits\` cells: the displacing
  // cascades' height and choppy pull, each faded where the cell cannot carry
  // its band, damped by the seabed's depth and faded with distance.
  vec3 waveSurfaceDisplacement(vec2 restXZ, float cellUnits) {
    float cellMetres = cellUnits * WAVE_DISP_METRES_PER_UNIT;
    vec2 fieldUv = terrainFieldUv(restXZ);
    vec4 fieldTexel = texture2D(terrainField, fieldUv);
    float depthMetres = terrainFieldInside(fieldUv) ? -terrainFieldHeight(fieldTexel) * WAVE_DISP_METRES_PER_UNIT : DISPLACEMENT_DEEP_METRES;
    float damping = shallowDisplacementDamping(depthMetres);
    float distanceFade = waveDetailFade(distance(vec3(restXZ.x, 0.0, restXZ.y), cameraPosition));
    vec3 d = vec3(0.0);${DISPLACEMENT_SUM}
    return d * (WAVE_HEIGHT_GAIN * damping * distanceFade / WAVE_DISP_METRES_PER_UNIT);
  }
`;

/**
 * Attaches the displacement textures, one per entry of DISPLACEMENT_CASCADES
 * in that order, to the uniforms \`waveDisplacement<c>\`.
 */
export function bindWaveDisplacementTextures<T>(
  uniforms: Record<string, { value: unknown }>,
  textures: readonly T[]
): void {
  if (textures.length !== DISPLACEMENT_CASCADES.length) {
    throw new RangeError(`${textures.length} displacement textures for ${DISPLACEMENT_CASCADES.length} displacing cascades.`);
  }
  textures.forEach((texture, i) => {
    uniforms[`waveDisplacement${DISPLACEMENT_CASCADES[i]}`] = { value: texture };
  });
}
