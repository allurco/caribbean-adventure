/**
 * Builds one continuous land mesh from the terrain height field: a triangular
 * lattice over the map, keeping only triangles on land or in the shallow skirt
 * just under the waterline. Open water away from land is skipped without
 * sampling the field. Pure (no Three.js) so it can be tested; the renderer
 * wraps the arrays in a BufferGeometry.
 *
 * Triangles are emitted unindexed with one colour per face, for the faceted
 * low-poly look under flat shading. Each face is coloured from its height
 * (wet sand → beach → jungle → highland, with noise-shifted boundaries), its
 * slope (rock on steep faces) and a cheap occlusion term (darker where the
 * face sits below its neighbourhood); see `landFaceColor`.
 */
import { createNoise2D } from "simplex-noise";
import { SEA_LEVEL, type TerrainHeightField } from "./terrainHeightField";
import { metresToUnits } from "./worldScale";

/** Lattice edge length in world units (a hex is 2 units across); fine enough to resolve the interior relief. */
export const LAND_MESH_SPACING = 0.15;
/**
 * Triangles whose highest vertex is below this depth are dropped: 100 m of
 * clear water hides the seabed (#38), and the ocean shader treats missing
 * seabed as bottomless.
 */
export const LAND_MESH_SKIRT_DEPTH = metresToUnits(100);

/** Underwater: wet sand fades to seabed sand over the first SEABED_SAND_FADE of depth. */
const SEABED_SAND_FADE = metresToUnits(1.5);
/** Seabed sand gives way to the deep seabed colour between these depths (down the drop-off). */
const SEABED_DEEP_BAND: readonly [number, number] = [metresToUnits(10), metresToUnits(30)];
/** Coral patch noise frequency (cycles per world unit) and the noise band over which a patch fills in. */
const CORAL_FREQUENCY = 2.5;
const CORAL_COVER: readonly [number, number] = [-0.25, 0.35];

/** Faces up to this height are wet sand; it fades to dry sand over ±WET_SAND_FADE. */
const WET_SAND_TOP = 0.05;
const WET_SAND_FADE = 0.02;
/**
 * Height bands [start, end] over which beach fades to jungle and jungle to
 * highland. Beach cells top out near 0.35 and jungle cells near 0.9
 * (ELEVATION_HEIGHTS plus relief), so a lone beach island stays sand.
 */
const SAND_TO_JUNGLE: readonly [number, number] = [0.42, 0.55];
const JUNGLE_TO_HIGHLAND: readonly [number, number] = [1.0, 1.2];
/** How far the boundary noise shifts each band, in world height. */
const SAND_TO_JUNGLE_NOISE = 0.08;
const JUNGLE_TO_HIGHLAND_NOISE = 0.15;
/** Boundary noise frequency in cycles per world unit, and its fixed seed. */
const BAND_NOISE_FREQUENCY = 1.1;
const BAND_NOISE_SEED = 0x9e3779b9;
/**
 * Steepness (1 − normal.y) over which a face turns to rock: ~50° to ~62°.
 * Beach shores rise at up to ~50°, so gentle coasts keep their sand while
 * steep coasts and mountain flanks show rock.
 */
const ROCK_STEEPNESS: readonly [number, number] = [0.36, 0.53];
/**
 * Occlusion: darkening per world unit the face sits below the mean height of a
 * ring of lattice points OCCLUSION_RING_STEPS (even) lattice steps around each
 * vertex, capped at OCCLUSION_MAX.
 */
export const LAND_MESH_OCCLUSION = 1.6;
const OCCLUSION_MAX = 0.3;
const OCCLUSION_RING_STEPS = 4;

type Rgb = readonly [number, number, number];

/** Linear-RGB face colours by band; the renderer passes the shared palette's entries. */
export interface LandMeshColors {
  wetSand: Rgb;
  drySand: Rgb;
  jungle: Rgb;
  /** Flat high ground. */
  highland: Rgb;
  /** Steep faces at any height. */
  rock: Rgb;
  /** Clean sand on the shallow seabed. */
  seabedSand: Rgb;
  /** Live coral on reefs. */
  coral: Rgb;
  /** Seabed down the drop-off. */
  deepSeabed: Rgb;
}

// Neutral fallback for tests and callers without a palette.
const DEFAULT_COLORS: LandMeshColors = {
  wetSand: [0.6, 0.52, 0.4],
  drySand: [0.82, 0.72, 0.55],
  jungle: [0.22, 0.55, 0.28],
  highland: [0.42, 0.45, 0.33],
  rock: [0.5, 0.47, 0.42],
  seabedSand: [0.52, 0.46, 0.34],
  coral: [0.09, 0.06, 0.02],
  deepSeabed: [0.3, 0.3, 0.2],
};

/** What `landFaceColor` needs to know about a face. */
export interface LandFaceSample {
  /** Mean height of the face (world Y). */
  height: number;
  /** Y of the unit face normal: 1 flat, 0 vertical. */
  normalY: number;
  /** Boundary noise in [-1, 1]. */
  noise: number;
  /** Neighbourhood mean height minus the face height: positive in hollows and at slope bases. */
  cavity: number;
  /** Share of the face covered by live coral, 0 … 1 (only on reefs, under water). */
  coral: number;
}

export interface LandMeshData {
  /** xyz per vertex, 3 vertices per triangle. */
  positions: Float32Array;
  /** rgb per vertex (same for all 3 vertices of a face). */
  colors: Float32Array;
  triangleCount: number;
  /**
   * The first this many triangles reach above sea level; the rest lie wholly
   * under water (seabed only the water shader sees).
   */
  aboveWaterTriangleCount: number;
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
  /** Occlusion strength (0 turns it off). Default LAND_MESH_OCCLUSION. */
  occlusion?: number;
  /** Reef mask in [0, 1] at world (x, z) (reefMask.ts); coral grows in patches where it is set. */
  sampleReef?: (x: number, z: number) => number;
}

function lerpRgb(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Ground colour of one face: height bands (wet sand, beach, jungle, highland)
 * with noise-shifted boundaries, rock blended in by steepness, then darkened
 * by occlusion. Faces below sea level are seabed: wet sand turning to clean
 * sand within the first metres, then the deep seabed colour down the drop-off,
 * with coral where `sample.coral` is set. `occlusion` scales the darkening per
 * unit of cavity.
 */
export function landFaceColor(
  colors: LandMeshColors,
  sample: LandFaceSample,
  occlusion = LAND_MESH_OCCLUSION
): [number, number, number] {
  const { height, normalY, noise, cavity, coral } = sample;
  let rgb: [number, number, number];
  if (height <= SEA_LEVEL) {
    const depth = SEA_LEVEL - height;
    rgb = lerpRgb(colors.wetSand, colors.seabedSand, smoothstep(0, SEABED_SAND_FADE, depth));
    rgb = lerpRgb(rgb, colors.deepSeabed, smoothstep(SEABED_DEEP_BAND[0], SEABED_DEEP_BAND[1], depth));
    if (coral > 0) rgb = lerpRgb(rgb, colors.coral, coral);
  } else if (height <= WET_SAND_TOP - WET_SAND_FADE) {
    rgb = [...colors.wetSand];
  } else {
    const jungle = smoothstep(SAND_TO_JUNGLE[0], SAND_TO_JUNGLE[1], height + noise * SAND_TO_JUNGLE_NOISE);
    const highland = smoothstep(
      JUNGLE_TO_HIGHLAND[0],
      JUNGLE_TO_HIGHLAND[1],
      height + noise * JUNGLE_TO_HIGHLAND_NOISE
    );
    rgb = lerpRgb(lerpRgb(colors.drySand, colors.jungle, jungle), colors.highland, highland);
    const dry = smoothstep(WET_SAND_TOP - WET_SAND_FADE, WET_SAND_TOP + WET_SAND_FADE, height);
    rgb = lerpRgb(colors.wetSand, rgb, dry);
  }
  // Underwater faces (hidden by the ocean) stay sand, so the seabed drop-off isn't rock.
  const rock = height > SEA_LEVEL ? smoothstep(ROCK_STEEPNESS[0], ROCK_STEEPNESS[1], 1 - normalY) : 0;
  if (rock > 0) rgb = lerpRgb(rgb, colors.rock, rock);
  const shade = 1 - Math.min(OCCLUSION_MAX, Math.max(0, cavity) * occlusion);
  return [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade];
}

/** Seeded PRNG (mulberry32) for the fixed boundary noise. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bandNoise = createNoise2D(mulberry32(BAND_NOISE_SEED));

/** Two-octave boundary noise in [-1, 1]. */
function boundaryNoise(x: number, z: number): number {
  const f = BAND_NOISE_FREQUENCY;
  return 0.7 * bandNoise(x * f, z * f) + 0.3 * bandNoise(x * f * 2.3 + 41.2, z * f * 2.3 - 13.5);
}

/** Coral cover (0 … 1) of a patch at (x, z): reef heads separated by sand channels. */
function coralPatch(x: number, z: number): number {
  const f = CORAL_FREQUENCY;
  const n = 0.7 * bandNoise(x * f + 211.3, z * f - 87.1) + 0.3 * bandNoise(x * f * 2.7 - 19.9, z * f * 2.7 + 63.4);
  return smoothstep(CORAL_COVER[0], CORAL_COVER[1], n);
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
  const occlusion = options.occlusion ?? LAND_MESH_OCCLUSION;
  const { sampleReef } = options;
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

  // Near-seabed flag per vertex (cheap hex lookup). Over open water the field
  // is deeper than the skirt, so those vertices are never sampled; heights are
  // sampled lazily, once, for the rest.
  const near = new Uint8Array(cols * rows);
  for (let v = 0; v < near.length; v++) {
    near[v] = !skipOpenWater || field.isNearSeabed(vertexX(v), vertexZ(v)) ? 1 : 0;
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

  // Per-vertex cavity: mean height of a hexagon of lattice points
  // OCCLUSION_RING_STEPS steps away, minus the vertex height. With an even
  // step count, rows j ± k share row j's parity, so (i ± k, j) and
  // (i ± k/2, j ± k) are exactly k·spacing away.
  const ring = OCCLUSION_RING_STEPS;
  const cavityAt = new Float32Array(cols * rows).fill(NaN);
  const vertexCavity = (v: number): number => {
    if (!Number.isNaN(cavityAt[v])) return cavityAt[v];
    const j = Math.floor(v / cols);
    const i = v - j * cols;
    const at = (di: number, dj: number) => {
      const ii = Math.max(0, Math.min(cols - 1, i + di));
      const jj = Math.max(0, Math.min(rows - 1, j + dj));
      return heightAt(jj * cols + ii);
    };
    const half = ring / 2;
    const mean =
      (at(ring, 0) + at(-ring, 0) + at(half, ring) + at(-half, ring) + at(half, -ring) + at(-half, -ring)) / 6;
    cavityAt[v] = mean - heightAt(v);
    return cavityAt[v];
  };

  // Pass 2: write the kept triangles straight into the output arrays, those
  // reaching above sea level first and the seabed after them.
  const aboveWater = (t: number) =>
    Math.max(vy[kept[t * 3]], vy[kept[t * 3 + 1]], vy[kept[t * 3 + 2]]) > SEA_LEVEL;
  let aboveWaterTriangleCount = 0;
  for (let t = 0; t < triangleCount; t++) if (aboveWater(t)) aboveWaterTriangleCount++;
  let nextAbove = 0;
  let nextBelow = aboveWaterTriangleCount;

  const positions = new Float32Array(triangleCount * 9);
  const colors = new Float32Array(triangleCount * 9);
  const sample: LandFaceSample = { height: 0, normalY: 1, noise: 0, cavity: 0, coral: 0 };
  for (let t = 0; t < triangleCount; t++) {
    const a = kept[t * 3];
    const b = kept[t * 3 + 1];
    const c = kept[t * 3 + 2];
    const out = aboveWater(t) ? nextAbove++ : nextBelow++;
    const ax = vertexX(a);
    const az = vertexZ(a);
    const ux = vertexX(b) - ax;
    const uy = vy[b] - vy[a];
    const uz = vertexZ(b) - az;
    const wx = vertexX(c) - ax;
    const wy = vy[c] - vy[a];
    const wz = vertexZ(c) - az;
    // Face normal u × w (the triangles are wound to face +Y).
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const cx = ax + (ux + wx) / 3;
    const cz = az + (uz + wz) / 3;
    sample.height = (vy[a] + vy[b] + vy[c]) / 3;
    sample.normalY = ny / Math.sqrt(nx * nx + ny * ny + nz * nz);
    sample.noise = boundaryNoise(cx, cz);
    sample.cavity = occlusion > 0 ? (vertexCavity(a) + vertexCavity(b) + vertexCavity(c)) / 3 : 0;
    const reef = sampleReef && sample.height <= SEA_LEVEL ? sampleReef(cx, cz) : 0;
    sample.coral = reef > 0 ? reef * coralPatch(cx, cz) : 0;
    const [r, g, bl] = landFaceColor(palette, sample, occlusion);
    const shade = 0.93 + hash(cx, cz) * 0.14;
    for (let k = 0; k < 3; k++) {
      const v = kept[t * 3 + k];
      const o = out * 9 + k * 3;
      positions[o] = vertexX(v);
      positions[o + 1] = vy[v];
      positions[o + 2] = vertexZ(v);
      colors[o] = r * shade;
      colors[o + 1] = g * shade;
      colors[o + 2] = bl * shade;
    }
  }

  return { positions, colors, triangleCount, aboveWaterTriangleCount };
}
