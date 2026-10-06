import { Color, ShaderMaterial, Vector2, Vector4 } from "three";
import type { Texture } from "three";
import type { GridFadeParams } from "./hexOutlineGrid";
import type { TerrainFieldTexture } from "./visuals/useTerrainFieldTexture";
import { WAVE_DISPLACEMENT_GLSL, bindWaveDisplacementTextures } from "./visuals/waveDisplacement";

/**
 * Line material for the water hex grid. Opacity fades with XZ distance from
 * `uFocus` (the camera focus point, updated every frame) and with the
 * per-vertex `aShore` fade across the shallows, and never drops below the
 * per-vertex `aEmphasis`, so acted-on hexes stay crisp anywhere. Emphasised
 * lines also blend from `uColor` toward `uEmphasisColor`.
 * The opacity formula mirrors `gridFadeOpacity` in `hexOutlineGrid.ts`.
 *
 * The lines sit a little above sea level and the sea heaves (#38 step 8),
 * so each vertex rides the same wave displacement as the water
 * (`waveSurfaceDisplacement`, waveDisplacement.ts), read at the level of
 * detail of a line segment; otherwise crests would swallow the grid.
 */

/** What the lines need to float on the displaced sea. */
export interface WaveSurface {
  /** The displacing cascades' textures (useWaveCascades), in DISPLACEMENT_CASCADES order. */
  displacements: readonly Texture[];
  /** The map's terrain field, which damps the displacement in the shallows. */
  terrainField: TerrainFieldTexture;
  /** Length of one line segment, world units: the displacement's level of detail. */
  segmentUnits: number;
}

const vertexShader = /* glsl */ `
  attribute float aEmphasis;
  attribute float aShore;
  uniform float uSegment;
  varying float vEmphasis;
  varying float vShore;
  varying vec2 vWorldXZ;
  ${WAVE_DISPLACEMENT_GLSL}

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.xyz += waveSurfaceDisplacement(world.xz, uSegment);
    vWorldXZ = world.xz;
    vEmphasis = aEmphasis;
    vShore = aShore;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uEmphasisColor;
  uniform vec2 uFocus;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  uniform float uBaseOpacity;
  varying float vEmphasis;
  varying float vShore;
  varying vec2 vWorldXZ;

  void main() {
    float d = distance(vWorldXZ, uFocus);
    float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, d);
    float alpha = max(uBaseOpacity * fade * vShore, vEmphasis);
    if (alpha < 0.002) discard;
    vec3 color = mix(uColor, uEmphasisColor, clamp(vEmphasis, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
  }
`;

export type HexOutlineUniforms = {
  uColor: { value: Color };
  uEmphasisColor: { value: Color };
  uFocus: { value: Vector2 };
  uFadeStart: { value: number };
  uFadeEnd: { value: number };
  uBaseOpacity: { value: number };
};

/** Push new fade radii (e.g. zoom-scaled) to an existing outline material. */
export function setHexOutlineFade(
  material: { uniforms: HexOutlineUniforms },
  { fadeStart, fadeEnd }: GridFadeParams
): void {
  material.uniforms.uFadeStart.value = fadeStart;
  material.uniforms.uFadeEnd.value = fadeEnd;
}

export function createHexOutlineMaterial(
  color: string,
  emphasisColor: string,
  { fadeStart, fadeEnd, baseOpacity }: GridFadeParams,
  surface: WaveSurface
): ShaderMaterial & { uniforms: HexOutlineUniforms } {
  const { minX, maxX, minZ, maxZ } = surface.terrainField.bounds;
  const uniforms: HexOutlineUniforms & Record<string, { value: unknown }> = {
    uColor: { value: new Color(color) },
    uEmphasisColor: { value: new Color(emphasisColor) },
    uFocus: { value: new Vector2() },
    uFadeStart: { value: fadeStart },
    uFadeEnd: { value: fadeEnd },
    uBaseOpacity: { value: baseOpacity },
    uSegment: { value: surface.segmentUnits },
    terrainField: { value: surface.terrainField.texture },
    mapBounds: { value: new Vector4(minX, maxX, minZ, maxZ) },
  };
  bindWaveDisplacementTextures(uniforms, surface.displacements);
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    // On a wrapping map the field covers one wrap width and repeats in s.
    defines: surface.terrainField.wrap ? { TERRAIN_FIELD_WRAP_X: "" } : {},
    transparent: true,
    depthWrite: false,
  });
  return material as ShaderMaterial & { uniforms: HexOutlineUniforms };
}
