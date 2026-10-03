/**
 * Builds one continuous land mesh from the terrain height field: a triangular
 * lattice over the map, keeping only triangles on land or in the shallow skirt
 * just under the waterline. Pure (no Three.js) so it can be tested; the
 * renderer wraps the arrays in a BufferGeometry.
 *
 * Triangles are emitted unindexed with one colour per face, for the faceted
 * low-poly look under flat shading.
 */
import type { TerrainHeightField } from "./terrainHeightField";

/** Lattice edge length in world units (a hex is 2 units across). */
export const LAND_MESH_SPACING = 0.25;
/** Triangles whose highest vertex is below this depth are dropped (hidden by the ocean). */
export const LAND_MESH_SKIRT_DEPTH = 0.35;

type Rgb = readonly [number, number, number];

// Placeholder palette by elevation until the terrain shader lands.
const SAND: Rgb = [0.82, 0.72, 0.55];
const JUNGLE: Rgb = [0.22, 0.55, 0.28];
const ROCK: Rgb = [0.5, 0.47, 0.42];
const WET_SAND: Rgb = [0.6, 0.52, 0.4];

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
}

function lerpRgb(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Face colour from blended elevation (1 beach … 3 mountain); wet sand below sea level. */
function faceColor(elevation: number, height: number): [number, number, number] {
  if (height <= 0) return [...WET_SAND];
  if (elevation <= 1) return [...SAND];
  if (elevation <= 2) return lerpRgb(SAND, JUNGLE, elevation - 1);
  return lerpRgb(JUNGLE, ROCK, Math.min(1, elevation - 2));
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
  const rowHeight = spacing * (Math.sqrt(3) / 2);
  const { minX, maxX, minZ, maxZ } = field.bounds;
  const cols = Math.ceil((maxX - minX) / spacing) + 1;
  const rows = Math.ceil((maxZ - minZ) / rowHeight) + 1;

  // Sample the field once per lattice vertex. Odd rows shift by half a spacing.
  const vx = new Float32Array(cols * rows);
  const vz = new Float32Array(cols * rows);
  const vy = new Float32Array(cols * rows);
  const ve = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const z = minZ + j * rowHeight;
    const shift = j % 2 === 1 ? spacing / 2 : 0;
    for (let i = 0; i < cols; i++) {
      const x = minX + i * spacing + shift;
      const v = j * cols + i;
      vx[v] = x;
      vz[v] = z;
      vy[v] = field.sampleHeight(x, z);
      ve[v] = vy[v] > -skirtDepth ? field.sampleElevation(x, z) : 0;
    }
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const emit = (a: number, b: number, c: number) => {
    if (Math.max(vy[a], vy[b], vy[c]) <= -skirtDepth) return;
    const elevation = (ve[a] + ve[b] + ve[c]) / 3;
    const height = (vy[a] + vy[b] + vy[c]) / 3;
    const cx = (vx[a] + vx[b] + vx[c]) / 3;
    const cz = (vz[a] + vz[b] + vz[c]) / 3;
    const [r, g, bl] = faceColor(elevation, height);
    const shade = 0.93 + hash(cx, cz) * 0.14;
    for (const v of [a, b, c]) {
      positions.push(vx[v], vy[v], vz[v]);
      colors.push(r * shade, g * shade, bl * shade);
    }
  };

  // Each pair of rows forms a strip of up/down triangles, wound
  // counter-clockwise seen from above (+Y normals).
  for (let j = 0; j < rows - 1; j++) {
    const a = j * cols; // this row
    const b = (j + 1) * cols; // next row
    for (let i = 0; i < cols - 1; i++) {
      if (j % 2 === 0) {
        // Next row is shifted right: b[i] sits between a[i] and a[i+1].
        emit(a + i, b + i, a + i + 1);
        emit(a + i + 1, b + i, b + i + 1);
      } else {
        // This row is shifted right: a[i] sits between b[i] and b[i+1].
        emit(b + i, b + i + 1, a + i);
        emit(a + i, b + i + 1, a + i + 1);
      }
    }
  }

  return {
    positions: Float32Array.from(positions),
    colors: Float32Array.from(colors),
    triangleCount: positions.length / 9,
  };
}
