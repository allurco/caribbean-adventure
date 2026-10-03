/**
 * Builds one continuous land mesh from the terrain height field: a triangular
 * lattice over the map, keeping only triangles on land or in the shallow skirt
 * just under the waterline. Open water away from land is skipped without
 * sampling the field. Pure (no Three.js) so it can be tested; the renderer
 * wraps the arrays in a BufferGeometry.
 *
 * Triangles are emitted unindexed with one colour per face, for the faceted
 * low-poly look under flat shading.
 */
import type { TerrainHeightField } from "./terrainHeightField";

/** Lattice edge length in world units (a hex is 2 units across); fine enough to resolve the interior relief. */
export const LAND_MESH_SPACING = 0.15;
/** Triangles whose highest vertex is below this depth are dropped (hidden by the ocean). */
export const LAND_MESH_SKIRT_DEPTH = 0.35;

type Rgb = readonly [number, number, number];

/** Linear-RGB face colours by band; the renderer passes the shared palette's entries. */
export interface LandMeshColors {
  wetSand: Rgb;
  drySand: Rgb;
  jungle: Rgb;
  highlandRock: Rgb;
}

// Neutral fallback for tests and callers without a palette.
const DEFAULT_COLORS: LandMeshColors = {
  wetSand: [0.6, 0.52, 0.4],
  drySand: [0.82, 0.72, 0.55],
  jungle: [0.22, 0.55, 0.28],
  highlandRock: [0.5, 0.47, 0.42],
};

export interface LandMeshData {
  /** xyz per vertex, 3 vertices per triangle. */
  positions: Float32Array;
  /** rgb per vertex (same for all 3 vertices of a face). */
  colors: Float32Array;
  triangleCount: number;
}

export interface LandMeshOptions {
  spacing?: number;
  skirtDepth?: number;
  colors?: LandMeshColors;
  /**
   * Skip lattice triangles whose vertices are all in open water (not in or next
   * to a land hex). Default true; the result matches the full scan as long as
   * open water lies below the skirt.
   */
  skipOpenWater?: boolean;
}

function lerpRgb(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Face colour from blended elevation (1 beach … 3 mountain); wet sand below sea level. */
function faceColor(colors: LandMeshColors, elevation: number, height: number): [number, number, number] {
  if (height <= 0) return [...colors.wetSand];
  if (elevation <= 1) return [...colors.drySand];
  if (elevation <= 2) return lerpRgb(colors.drySand, colors.jungle, elevation - 1);
  return lerpRgb(colors.jungle, colors.highlandRock, Math.min(1, elevation - 2));
}

/** Hash in [0, 1) for small per-face colour variation. */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function buildLandMesh(
  field: TerrainHeightField,
  options: LandMeshOptions = {}
): LandMeshData {
  const spacing = options.spacing ?? LAND_MESH_SPACING;
  const skirtDepth = options.skirtDepth ?? LAND_MESH_SKIRT_DEPTH;
  const skipOpenWater = options.skipOpenWater ?? true;
  const palette = options.colors ?? DEFAULT_COLORS;
  const rowHeight = spacing * (Math.sqrt(3) / 2);
  const { minX, maxX, minZ, maxZ } = field.bounds;
  const cols = Math.ceil((maxX - minX) / spacing) + 1;
  const rows = Math.ceil((maxZ - minZ) / rowHeight) + 1;

  // Lattice vertex (i, j) sits at (minX + i·spacing [+ spacing/2 on odd rows], minZ + j·rowHeight).
  const vertexX = (v: number) => {
    const j = Math.floor(v / cols);
    return minX + (v - j * cols) * spacing + (j % 2 === 1 ? spacing / 2 : 0);
  };
  const vertexZ = (v: number) => minZ + Math.floor(v / cols) * rowHeight;

  // Near-land flag per vertex (cheap hex lookup). Over open water (~80% of
  // the lattice) the field is deeper than the skirt, so those vertices are
  // never sampled; heights are sampled lazily, once, for the rest.
  const near = new Uint8Array(cols * rows);
  for (let v = 0; v < near.length; v++) {
    near[v] = !skipOpenWater || field.isNearLand(vertexX(v), vertexZ(v)) ? 1 : 0;
  }
  const vy = new Float32Array(cols * rows).fill(NaN);
  const heightAt = (v: number): number => {
    if (Number.isNaN(vy[v])) vy[v] = field.sampleHeight(vertexX(v), vertexZ(v));
    return vy[v];
  };

  // Pass 1: find the kept triangles (vertex index triples).
  let kept = new Uint32Array(1024 * 3);
  let triangleCount = 0;
  const consider = (a: number, b: number, c: number) => {
    if (!near[a] && !near[b] && !near[c]) return;
    if (Math.max(heightAt(a), heightAt(b), heightAt(c)) <= -skirtDepth) return;
    if ((triangleCount + 1) * 3 > kept.length) {
      const grown = new Uint32Array(kept.length * 2);
      grown.set(kept);
      kept = grown;
    }
    kept[triangleCount * 3] = a;
    kept[triangleCount * 3 + 1] = b;
    kept[triangleCount * 3 + 2] = c;
    triangleCount++;
  };

  // Each pair of rows forms a strip of up/down triangles, wound
  // counter-clockwise seen from above (+Y normals).
  for (let j = 0; j < rows - 1; j++) {
    const a = j * cols; // this row
    const b = (j + 1) * cols; // next row
    for (let i = 0; i < cols - 1; i++) {
      if (j % 2 === 0) {
        // Next row is shifted right: b[i] sits between a[i] and a[i+1].
        consider(a + i, b + i, a + i + 1);
        consider(a + i + 1, b + i, b + i + 1);
      } else {
        // This row is shifted right: a[i] sits between b[i] and b[i+1].
        consider(b + i, b + i + 1, a + i);
        consider(a + i, b + i + 1, a + i + 1);
      }
    }
  }

  // Pass 2: write the kept triangles straight into the output arrays.
  const ve = new Float32Array(cols * rows).fill(NaN);
  const elevationAt = (v: number): number => {
    if (Number.isNaN(ve[v])) ve[v] = heightAt(v) > -skirtDepth ? field.sampleElevation(vertexX(v), vertexZ(v)) : 0;
    return ve[v];
  };
  const positions = new Float32Array(triangleCount * 9);
  const colors = new Float32Array(triangleCount * 9);
  for (let t = 0; t < triangleCount; t++) {
    const a = kept[t * 3];
    const b = kept[t * 3 + 1];
    const c = kept[t * 3 + 2];
    const elevation = (elevationAt(a) + elevationAt(b) + elevationAt(c)) / 3;
    const height = (vy[a] + vy[b] + vy[c]) / 3;
    const cx = (vertexX(a) + vertexX(b) + vertexX(c)) / 3;
    const cz = (vertexZ(a) + vertexZ(b) + vertexZ(c)) / 3;
    const [r, g, bl] = faceColor(palette, elevation, height);
    const shade = 0.93 + hash(cx, cz) * 0.14;
    for (let k = 0; k < 3; k++) {
      const v = kept[t * 3 + k];
      const o = t * 9 + k * 3;
      positions[o] = vertexX(v);
      positions[o + 1] = vy[v];
      positions[o + 2] = vertexZ(v);
      colors[o] = r * shade;
      colors[o + 1] = g * shade;
      colors[o + 2] = bl * shade;
    }
  }

  return { positions, colors, triangleCount };
}
