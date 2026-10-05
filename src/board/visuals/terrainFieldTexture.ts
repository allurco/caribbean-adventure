/**
 * Bakes the terrain height field (ADR 0001) into texture data for GPU
 * consumers (water colour, shore foam and reefs).
 *
 * Pure apart from three's half-float conversion, so the layout is
 * unit-tested. The component wraps `data` in a DataTexture (RGBA, HalfFloat,
 * linear filtering, clamp to edge).
 *
 * Layout: `width × height` RGBA texels covering `bounds` (the field's bounds).
 * Texel (i, j) starts at element `(j · width + i) · 4` and holds the field
 * sampled at its centre, `texelCenter(i, j)`: x grows along a row, rows go
 * from minZ up. That is exactly where GL samples it with
 *   uv = ((x − minX) / (maxX − minX), (z − minZ) / (maxZ − minZ)).
 *
 * Channels, all IEEE half floats in world units (read in GLSL with
 * `TERRAIN_FIELD_GLSL`):
 *   R  height (world Y): 0 is sea level exactly.
 *   G  coast signed distance (+ land, − water), for shore foam (#10).
 *   B  reef mask (#11), 0 … 1: 0 off reef, 1 inside a reef hex, ramping over a
 *      soft rim just inside the reef outline (see reefMask.ts). 0 everywhere
 *      when the bake is given no `sampleReef`.
 *   A  reef windward weight (#38 step 7), 0 … 1: how much of the reef foam
 *      this part of a reef gets, 1 on the face that meets the wind
 *      (shoreFoam.ts `reefWindwardWeight`). 1 everywhere when the bake is
 *      given no `sampleReefWindward`; only read where B is set.
 *
 * Half float (#38) rather than 8 bits: water colour depends on depth most in
 * the first ~10 m, where the old 8-bit code stepped 0.38 m and banded. A half
 * float keeps 11 significant bits, so depths up to 10 m round to under 1 cm
 * and every height in the field to within 0.1%. Half-float textures are
 * linearly filterable in WebGL2 without extensions.
 *
 * Nothing here assumes the map has hard east/west edges: the bake samples the
 * field over its bounds and the GLSL helpers only map world XZ to uv. A
 * wrapping field's bounds are exactly one wrap width in x, so its texel
 * centres repeat with the field and the texture tiles (#36).
 */
import { DataUtils } from "three";
import type { TerrainBounds, TerrainHeightField } from "./terrainHeightField";

/**
 * Default texel density, ~5.4 m per texel: finer than the land mesh lattice
 * (0.15) so the shallows trace the same noisy coast, and fine enough that the
 * surf outline, drawn from the coast distance, isn't visibly polygonal. The
 * land mesh has its own lattice spacing and does not follow this.
 */
export const TERRAIN_TEXELS_PER_UNIT = 12;
/**
 * Max texels per side. The large map needs ~1000 at the default density once
 * the bounds reach past an edge island's drop-off (#38); at 8 bytes per
 * RGBA half-float texel that is ~11 MB. 1280 leaves headroom and stays well
 * under the 2048 per side WebGL2 guarantees.
 */
export const TERRAIN_TEXTURE_MAX_SIZE = 1280;

export interface BakedTerrainField {
  /** RGBA half floats (raw bits), row-major, `width · height · 4` long. */
  data: Uint16Array;
  width: number;
  height: number;
  /** World XZ extent the texture covers (the field's bounds). */
  bounds: TerrainBounds;
}

export interface BakeTerrainFieldOptions {
  texelsPerUnit?: number;
  maxSize?: number;
  /** Reef mask in [0, 1] at world (x, z), baked into B; omitted means no reefs. */
  sampleReef?: (x: number, z: number) => number;
  /** Reef windward weight in [0, 1] at world (x, z), baked into A; omitted means 1. */
  sampleReefWindward?: (x: number, z: number) => number;
}

export function encodeHeight(h: number): number {
  return DataUtils.toHalfFloat(h);
}

export function decodeHeight(code: number): number {
  return DataUtils.fromHalfFloat(code);
}

export function encodeCoastDistance(d: number): number {
  return DataUtils.toHalfFloat(d);
}

export function decodeCoastDistance(code: number): number {
  return DataUtils.fromHalfFloat(code);
}

export function encodeReef(mask: number): number {
  return DataUtils.toHalfFloat(Math.max(0, Math.min(1, mask)));
}

export function decodeReef(code: number): number {
  return DataUtils.fromHalfFloat(code);
}

/**
 * GLSL helpers matching the encoding above. Paste into a shader that has a
 * `vec4 mapBounds` (minX, maxX, minZ, maxZ) uniform in scope. On a wrapping
 * map (#36) the bake covers exactly one wrap width, so define
 * `TERRAIN_FIELD_WRAP_X` and give the texture repeat wrapping in s: every x is
 * then inside the field.
 */
export const TERRAIN_FIELD_GLSL = `
  vec2 terrainFieldUv(vec2 worldXZ) {
    return (worldXZ - mapBounds.xz) / (mapBounds.yw - mapBounds.xz);
  }
  bool terrainFieldInside(vec2 uv) {
  #ifdef TERRAIN_FIELD_WRAP_X
    return uv.y >= 0.0 && uv.y <= 1.0;
  #else
    return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  #endif
  }
  float terrainFieldHeight(vec4 texel) {
    return texel.r;
  }
  float terrainFieldCoastDistance(vec4 texel) {
    return texel.g;
  }
  float terrainFieldReef(vec4 texel) {
    return texel.b;
  }
  float terrainFieldReefWindward(vec4 texel) {
    return texel.a;
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

  const { sampleReef, sampleReefWindward } = options;
  const data = new Uint16Array(width * height * 4);
  const baked: BakedTerrainField = { data, width, height, bounds };
  const one = DataUtils.toHalfFloat(1);
  const noReef = encodeReef(0);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const [x, z] = texelCenter(baked, i, j);
      const k = (j * width + i) * 4;
      data[k] = encodeHeight(field.sampleHeight(x, z));
      data[k + 1] = encodeCoastDistance(field.sampleCoastDistance(x, z));
      data[k + 2] = sampleReef ? encodeReef(sampleReef(x, z)) : noReef;
      data[k + 3] = sampleReefWindward ? encodeReef(sampleReefWindward(x, z)) : one;
    }
  }
  return baked;
}
