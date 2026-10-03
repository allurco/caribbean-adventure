/**
 * Bakes the terrain height field (ADR 0001) into texture data for GPU
 * consumers (ocean depth colour now; shore foam and reefs later).
 *
 * Pure: no Three.js, so the layout is unit-tested. The component wraps `data`
 * in a DataTexture (RGBA, UnsignedByte, linear filtering, clamp to edge).
 *
 * Layout: `width × height` RGBA texels covering `bounds` (the field's bounds).
 * Texel (i, j) is at byte `(j · width + i) · 4` and holds the field sampled at
 * its centre, `texelCenter(i, j)`: x grows along a row, rows go from minZ up.
 * That is exactly where GL samples it with
 *   uv = ((x − minX) / (maxX − minX), (z − minZ) / (maxZ − minZ)).
 *
 * Channels (8-bit, decode in GLSL with `TERRAIN_FIELD_GLSL`):
 *   R  height (world Y): code 170 is sea level exactly; one step is
 *      HEIGHT_STEP; covers HEIGHT_ENCODE_MIN … HEIGHT_ENCODE_MAX, clamped
 *      (land above +0.5 saturates, which water shaders never need).
 *   G  coast signed distance (+ land, − water), ±COAST_ENCODE_RANGE, for
 *      shore foam (#10).
 *   B  reserved for a reef mask (#11); 0 for now.
 *   A  reserved; 255.
 *
 * 8-bit RGBA rather than float so linear filtering works on every WebGL
 * device (float textures need OES_texture_float_linear) at a quarter the size.
 */
import type { TerrainBounds, TerrainHeightField } from "./terrainHeightField";

/** Default texel density: finer than the land mesh lattice (0.15) so the shallows trace the same noisy coast. */
export const TERRAIN_TEXELS_PER_UNIT = 8;
/** Max texels per side; the large map needs ~730 at the default density. */
export const TERRAIN_TEXTURE_MAX_SIZE = 1024;

/** R code for sea level, and the height of one code step. */
const SEA_LEVEL_CODE = 170;
const HEIGHT_STEP = 1.5 / 255;
export const HEIGHT_ENCODE_MIN = -SEA_LEVEL_CODE * HEIGHT_STEP; // −1, the seabed floor
export const HEIGHT_ENCODE_MAX = (255 - SEA_LEVEL_CODE) * HEIGHT_STEP; // +0.5

/** Coast distance range stored in G (the field clamps it to ±2 before noise). */
export const COAST_ENCODE_RANGE = 2.25;

export interface BakedTerrainField {
  /** RGBA bytes, row-major, `width · height · 4` long. */
  data: Uint8Array;
  width: number;
  height: number;
  /** World XZ extent the texture covers (the field's bounds). */
  bounds: TerrainBounds;
}

export interface BakeTerrainFieldOptions {
  texelsPerUnit?: number;
  maxSize?: number;
}

const toByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

export function encodeHeight(h: number): number {
  return toByte(SEA_LEVEL_CODE + h / HEIGHT_STEP);
}

export function decodeHeight(code: number): number {
  return (code - SEA_LEVEL_CODE) * HEIGHT_STEP;
}

export function encodeCoastDistance(d: number): number {
  return toByte(((d + COAST_ENCODE_RANGE) / (2 * COAST_ENCODE_RANGE)) * 255);
}

export function decodeCoastDistance(code: number): number {
  return (code / 255) * 2 * COAST_ENCODE_RANGE - COAST_ENCODE_RANGE;
}

/**
 * GLSL helpers matching the encoding above. Paste into a shader that has a
 * `vec4 mapBounds` (minX, maxX, minZ, maxZ) uniform in scope.
 */
export const TERRAIN_FIELD_GLSL = `
  vec2 terrainFieldUv(vec2 worldXZ) {
    return (worldXZ - mapBounds.xz) / (mapBounds.yw - mapBounds.xz);
  }
  bool terrainFieldInside(vec2 uv) {
    return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  }
  float terrainFieldHeight(vec4 texel) {
    return (texel.r * 255.0 - ${SEA_LEVEL_CODE.toFixed(1)}) * ${HEIGHT_STEP.toFixed(8)};
  }
  float terrainFieldCoastDistance(vec4 texel) {
    return (texel.g * 2.0 - 1.0) * ${COAST_ENCODE_RANGE.toFixed(4)};
  }
`;

/** World (x, z) at the centre of texel (i, j). */
export function texelCenter(
  baked: Pick<BakedTerrainField, "width" | "height" | "bounds">,
  i: number,
  j: number
): [number, number] {
  const { minX, maxX, minZ, maxZ } = baked.bounds;
  return [
    minX + (i + 0.5) * ((maxX - minX) / baked.width),
    minZ + (j + 0.5) * ((maxZ - minZ) / baked.height),
  ];
}

/** Sample the field at every texel centre over its bounds. Run once per map. */
export function bakeTerrainField(
  field: Pick<TerrainHeightField, "sampleHeight" | "sampleCoastDistance" | "bounds">,
  options: BakeTerrainFieldOptions = {}
): BakedTerrainField {
  const { bounds } = field;
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const maxSize = options.maxSize ?? TERRAIN_TEXTURE_MAX_SIZE;
  // One density for both axes keeps texels square; shrink it if the long side would exceed the cap.
  const density = Math.min(options.texelsPerUnit ?? TERRAIN_TEXELS_PER_UNIT, maxSize / Math.max(spanX, spanZ, 1e-6));
  const width = Math.max(1, Math.min(maxSize, Math.ceil(spanX * density)));
  const height = Math.max(1, Math.min(maxSize, Math.ceil(spanZ * density)));

  const data = new Uint8Array(width * height * 4);
  const baked: BakedTerrainField = { data, width, height, bounds };
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const [x, z] = texelCenter(baked, i, j);
      const k = (j * width + i) * 4;
      data[k] = encodeHeight(field.sampleHeight(x, z));
      data[k + 1] = encodeCoastDistance(field.sampleCoastDistance(x, z));
      data[k + 2] = 0;
      data[k + 3] = 255;
    }
  }
  return baked;
}
