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
const SEABED_SAND_FADE = metresToUnits(0.5);
/** Seabed sand gives way to the deep seabed colour between these depths (down the drop-off). */
const SEABED_DEEP_BAND: readonly [number, number] = [metresToUnits(10), metresToUnits(30)];
/**
 * Coral patch noise frequency (cycles per world unit), the noise band over
 * which a patch fills in, and the densest cover a face gets (sand and rubble
 * show between coral heads even in a dense patch).
 */
const CORAL_FREQUENCY = 3;
const CORAL_COVER: readonly [number, number] = [-0.05, 0.3];
const CORAL_MAX_COVER = 0.85;
/**
 * Seabed refinement: a seabed triangle spanning more than this much height
 * (5 m) is split in four, halving the lattice (to ~5 m) down the drop-off and
 * reef flanks. (8 m saved only ~5% of the build time.)
 */
const SEABED_SPLIT_RISE = metresToUnits(5);

/**
 * Sand dries from wet at the waterline to dry by this height (~1.9 m, the
 * swash zone of a calm beach), along a smooth ramp. It used to be a flat
 * wet band 3.25 m high, which read as a dark ledge above the clear water once
 * the water stopped being painted wet-sand coloured at the shore (#38).
 */
const WET_SAND_TOP = 0.03;
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
  /** rgb per vertex: one colour per face on land, blended per vertex on the seabed. */
  colors: Float32Array;
  /** Unit normal per vertex: the face normal on land, the field's smooth normal on the seabed. */
  normals: Float32Array;
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
  } else {
    const jungle = smoothstep(SAND_TO_JUNGLE[0], SAND_TO_JUNGLE[1], height + noise * SAND_TO_JUNGLE_NOISE);
    const highland = smoothstep(
      JUNGLE_TO_HIGHLAND[0],
      JUNGLE_TO_HIGHLAND[1],
      height + noise * JUNGLE_TO_HIGHLAND_NOISE
    );
    rgb = lerpRgb(lerpRgb(colors.drySand, colors.jungle, jungle), colors.highland, highland);
    const dry = smoothstep(0, WET_SAND_TOP, height);
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
  return CORAL_MAX_COVER * smoothstep(CORAL_COVER[0], CORAL_COVER[1], n);
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

  // Points: lattice vertices keep their index; edge midpoints added by the
  // seabed refinement get indices from `latticeSize` up.
  const latticeSize = cols * rows;
  let midCount = 0;
  let midCapacity = 4096;
  let midData = new Float64Array(midCapacity * 4); // x, z, y, cavity
  let midEnds = new Int32Array(midCapacity * 2); // the two lattice ends
  const pointX = (p: number) => (p < latticeSize ? vertexX(p) : midData[(p - latticeSize) * 4]);
  const pointZ = (p: number) => (p < latticeSize ? vertexZ(p) : midData[(p - latticeSize) * 4 + 1]);
  const pointY = (p: number) => (p < latticeSize ? vy[p] : midData[(p - latticeSize) * 4 + 2]);
  const pointCavity = (p: number) =>
    occlusion <= 0 ? 0 : p < latticeSize ? vertexCavity(p) : midData[(p - latticeSize) * 4 + 3];

  /**
   * A lattice edge's id: its lower vertex · 3 + direction (0 along the row,
   * 1 and 2 to the left and right neighbours in the next row).
   */
  const edgeId = (a: number, b: number): number => {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    if (hi - lo === 1) return lo * 3;
    const evenRow = Math.floor(lo / cols) % 2 === 0;
    return lo * 3 + 1 + (hi - lo - cols + (evenRow ? 1 : 0));
  };

  // Steep seabed triangles (wholly under water, spanning more than
  // SEABED_SPLIT_RISE of height) are split in four. Their edges are marked, so
  // a neighbour sharing one splits it too: the decision is per edge, and the
  // mesh has no T-junction cracks.
  const splitEdge = new Uint8Array(latticeSize * 3);
  for (let t = 0; t < triangleCount; t++) {
    const a = kept[t * 3];
    const b = kept[t * 3 + 1];
    const c = kept[t * 3 + 2];
    const top = Math.max(vy[a], vy[b], vy[c]);
    const bottom = Math.min(vy[a], vy[b], vy[c]);
    if (top > SEA_LEVEL || top - bottom <= SEABED_SPLIT_RISE) continue;
    splitEdge[edgeId(a, b)] = 1;
    splitEdge[edgeId(b, c)] = 1;
    splitEdge[edgeId(c, a)] = 1;
  }
  const midpointOf = new Int32Array(latticeSize * 3).fill(-1);

  /** The midpoint of lattice edge (a, b) if the seabed refinement splits it, else -1. */
  const split = (a: number, b: number): number => {
    const k = edgeId(a, b);
    if (!splitEdge[k]) return -1;
    if (midpointOf[k] >= 0) return midpointOf[k];
    if (midCount === midCapacity) {
      midCapacity *= 2;
      const data = new Float64Array(midCapacity * 4);
      data.set(midData);
      midData = data;
      const ends = new Int32Array(midCapacity * 2);
      ends.set(midEnds);
      midEnds = ends;
    }
    const x = (vertexX(a) + vertexX(b)) / 2;
    const z = (vertexZ(a) + vertexZ(b)) / 2;
    const o = midCount * 4;
    midData[o] = x;
    midData[o + 1] = z;
    midData[o + 2] = field.sampleHeight(x, z);
    midData[o + 3] = occlusion > 0 ? (vertexCavity(a) + vertexCavity(b)) / 2 : 0;
    midEnds[midCount * 2] = a;
    midEnds[midCount * 2 + 1] = b;
    midpointOf[k] = latticeSize + midCount;
    return latticeSize + midCount++;
  };

  // Pass 2: split each kept triangle along its refined edges (keeping the
  // counter-clockwise winding), then sort the pieces into land and seabed.
  const growable = () => ({ data: new Uint32Array(1 << 16), length: 0 });
  const land = growable();
  const seabed = growable();
  const push3 = (list: ReturnType<typeof growable>, a: number, b: number, c: number) => {
    if (list.length + 3 > list.data.length) {
      const grown = new Uint32Array(list.data.length * 2);
      grown.set(list.data);
      list.data = grown;
    }
    list.data[list.length++] = a;
    list.data[list.length++] = b;
    list.data[list.length++] = c;
  };
  const emit = (a: number, b: number, c: number) => {
    const top = Math.max(pointY(a), pointY(b), pointY(c));
    if (top <= -skirtDepth) return;
    push3(top > SEA_LEVEL ? land : seabed, a, b, c);
  };
  // Emit triangle (a b c) whose edges (a b), (b c), (c a) have midpoints
  // mab, mbc, mca (−1 where not split), with (a b) split, and also (b c) when
  // two edges are.
  const emitSplit = (a: number, b: number, c: number, mab: number, mbc: number) => {
    if (mbc < 0) {
      emit(a, mab, c);
      emit(mab, b, c);
    } else {
      emit(mab, b, mbc);
      emit(a, mab, mbc);
      emit(a, mbc, c);
    }
  };
  for (let t = 0; t < triangleCount; t++) {
    const v0 = kept[t * 3];
    const v1 = kept[t * 3 + 1];
    const v2 = kept[t * 3 + 2];
    const m0 = split(v0, v1);
    const m1 = split(v1, v2);
    const m2 = split(v2, v0);
    const splits = (m0 >= 0 ? 1 : 0) + (m1 >= 0 ? 1 : 0) + (m2 >= 0 ? 1 : 0);
    if (splits === 0) emit(v0, v1, v2);
    else if (splits === 3) {
      emit(v0, m0, m2);
      emit(m0, v1, m1);
      emit(m2, m1, v2);
      emit(m0, m1, m2);
    } else if (splits === 1) {
      if (m0 >= 0) emitSplit(v0, v1, v2, m0, -1);
      else if (m1 >= 0) emitSplit(v1, v2, v0, m1, -1);
      else emitSplit(v2, v0, v1, m2, -1);
    } else {
      // Two splits: rotate so the unsplit edge is (c a).
      if (m2 < 0) emitSplit(v0, v1, v2, m0, m1);
      else if (m0 < 0) emitSplit(v1, v2, v0, m1, m2);
      else emitSplit(v2, v0, v1, m2, m0);
    }
  }

  const aboveWaterTriangleCount = land.length / 3;
  const outCount = aboveWaterTriangleCount + seabed.length / 3;
  const positions = new Float32Array(outCount * 9);
  const colors = new Float32Array(outCount * 9);
  const normals = new Float32Array(outCount * 9);
  const writePoint = (o: number, p: number) => {
    positions[o] = pointX(p);
    positions[o + 1] = pointY(p);
    positions[o + 2] = pointZ(p);
  };

  // Land: flat, one normal and one colour per face, for the low-poly look.
  const sample: LandFaceSample = { height: 0, normalY: 1, noise: 0, cavity: 0, coral: 0 };
  for (let t = 0; t < aboveWaterTriangleCount; t++) {
    const a = land.data[t * 3];
    const b = land.data[t * 3 + 1];
    const c = land.data[t * 3 + 2];
    const ax = pointX(a);
    const az = pointZ(a);
    const ux = pointX(b) - ax;
    const uy = pointY(b) - pointY(a);
    const uz = pointZ(b) - az;
    const wx = pointX(c) - ax;
    const wy = pointY(c) - pointY(a);
    const wz = pointZ(c) - az;
    // Face normal u × w (the triangles are wound to face +Y).
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const cx = ax + (ux + wx) / 3;
    const cz = az + (uz + wz) / 3;
    sample.height = (pointY(a) + pointY(b) + pointY(c)) / 3;
    sample.normalY = ny / nl;
    sample.noise = boundaryNoise(cx, cz);
    sample.cavity = (pointCavity(a) + pointCavity(b) + pointCavity(c)) / 3;
    const reef = sampleReef && sample.height <= SEA_LEVEL ? sampleReef(cx, cz) : 0;
    sample.coral = reef > 0 ? reef * coralPatch(cx, cz) : 0;
    const [r, g, bl] = landFaceColor(palette, sample, occlusion);
    const shade = 0.93 + hash(cx, cz) * 0.14;
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      writePoint(o, land.data[t * 3 + k]);
      colors[o] = r * shade;
      colors[o + 1] = g * shade;
      colors[o + 2] = bl * shade;
      normals[o] = nx / nl;
      normals[o + 1] = ny / nl;
      normals[o + 2] = nz / nl;
    }
  }

  // Seabed: smooth, with the field's own normal and a colour per point, so
  // no facets show through clear water.
  // Height gradient at a lattice vertex by central differences on the lattice
  // (neighbours along the row, and the two-vertex average straight above and
  // below it in the half-offset rows); a midpoint averages its two ends.
  const at = (ii: number, jj: number) =>
    heightAt(Math.max(0, Math.min(rows - 1, jj)) * cols + Math.max(0, Math.min(cols - 1, ii)));
  /** Add the height gradient at lattice vertex v, times `w`, into grad[0..1]. */
  const grad = new Float64Array(2);
  const addLatticeGradient = (v: number, w: number) => {
    const j = Math.floor(v / cols);
    const i = v - j * cols;
    grad[0] += (w * (at(i + 1, j) - at(i - 1, j))) / (2 * spacing);
    // Odd rows sit half a step right: the vertices flanking x in the row above
    // and below are (i−1, i) from an even row and (i, i+1) from an odd one.
    const lo = j % 2 === 0 ? i - 1 : i;
    const up = (at(lo, j + 1) + at(lo + 1, j + 1)) / 2;
    const down = (at(lo, j - 1) + at(lo + 1, j - 1)) / 2;
    grad[1] += (w * (up - down)) / (2 * rowHeight);
  };

  // Per point: normal xyz and colour rgb, filled on first use.
  const shading = new Float32Array((latticeSize + midCount) * 6);
  const shaded = new Uint8Array(latticeSize + midCount);
  const shade = (p: number) => {
    shaded[p] = 1;
    grad[0] = 0;
    grad[1] = 0;
    if (p < latticeSize) addLatticeGradient(p, 1);
    else {
      addLatticeGradient(midEnds[(p - latticeSize) * 2], 0.5);
      addLatticeGradient(midEnds[(p - latticeSize) * 2 + 1], 0.5);
    }
    const nl = Math.sqrt(grad[0] * grad[0] + 1 + grad[1] * grad[1]);
    const x = pointX(p);
    const z = pointZ(p);
    sample.height = pointY(p);
    sample.normalY = 1 / nl;
    sample.noise = 0; // only the land bands use it
    sample.cavity = pointCavity(p);
    const reef = sampleReef ? sampleReef(x, z) : 0;
    sample.coral = reef > 0 ? reef * coralPatch(x, z) : 0;
    const [r, g, b] = landFaceColor(palette, sample, occlusion);
    const o = p * 6;
    shading[o] = -grad[0] / nl;
    shading[o + 1] = 1 / nl;
    shading[o + 2] = -grad[1] / nl;
    shading[o + 3] = r;
    shading[o + 4] = g;
    shading[o + 5] = b;
  };
  for (let i = 0; i < seabed.length; i++) {
    const p = seabed.data[i];
    const o = aboveWaterTriangleCount * 9 + i * 3;
    writePoint(o, p);
    if (!shaded[p]) shade(p);
    const s = p * 6;
    normals[o] = shading[s];
    normals[o + 1] = shading[s + 1];
    normals[o + 2] = shading[s + 2];
    colors[o] = shading[s + 3];
    colors[o + 1] = shading[s + 4];
    colors[o + 2] = shading[s + 5];
  }

  return { positions, colors, normals, triangleCount: outCount, aboveWaterTriangleCount };
}
