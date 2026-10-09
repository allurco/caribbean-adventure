/**
 * Builds one continuous land mesh from the terrain height field: a triangular
 * lattice over the map, keeping only triangles on land or in the shallow skirt
 * just under the waterline. Open water away from land is skipped without
 * sampling the field. Pure (no Three.js) so it can be tested; the renderer
 * wraps the arrays in a BufferGeometry.
 *
 * Land triangles are emitted unindexed with one colour per face, for the
 * faceted low-poly look under flat shading; the seabed is indexed and
 * smooth-shaded (one vertex per point). Each land face is coloured from its height
 * (wet sand → beach → jungle → highland, with noise-shifted boundaries), its
 * slope (rock on steep faces) and a cheap occlusion term (darker where the
 * face sits below its neighbourhood); see `landFaceColor`.
 */
import type { GroundField } from "./groundPlacement";
import { createPlaneNoise, type PlaneNoise } from "./periodicNoise";
import { SEA_LEVEL, type TerrainHeightField } from "./terrainHeightField";
import { metresToUnits } from "./worldScale";
import { VISIBLE_SEABED_DEPTH } from "./waterOptics";
import { TOWN_REFINE, townGround, type TownSurface } from "./townGround";

export { VISIBLE_SEABED_DEPTH };

/**
 * How near a town's plan a lattice corner must be for its triangles to be
 * refined (#87): a lattice step and a quarter, so every town feature sits
 * where the refinement is whole (`townGround.ts`).
 */
export const TOWN_FLAG_MARGIN = 0.15 * 1.25;
/** The town's ground colours (#87), linear RGB: weathered setts on the main street and the square, trodden earth on the lanes. */
export const TOWN_SURFACE_COLORS: Readonly<Record<Exclude<TownSurface, "ground">, Rgb>> = {
  paved: [0.3, 0.27, 0.22],
  earth: [0.36, 0.26, 0.16],
};

/**
 * Whether a lattice triangle is refined for a town (#87): a flagged corner
 * (`flags`, the count of them) and every corner above the sea. A triangle
 * reaching the waterline is left whole (a fan, if a refined one borders it),
 * so no refined edge ever meets the smooth seabed mesh, which is not cut.
 * A corner is flagged only if it is near a town and it and its six lattice
 * neighbours are above the sea (`townFlag`), so an edge that bends away from
 * the coarse plane (a flagged end) has a refined triangle on both sides.
 */
const isRefined = (flags: number, ay: number, by: number, cy: number): boolean =>
  flags > 0 && Math.min(ay, by, cy) > SEA_LEVEL;

/**
 * A lattice corner's town flag (1 or 0): near a town (`near`) with itself
 * and its six lattice neighbours above the sea. `height(di, dj)` is the
 * height of the corner `di` columns and `dj` rows away, or undefined off the
 * lattice; `oddRow` says whether the corner's row is shifted half a step
 * right, which decides which columns its neighbours above and below are in.
 */
function townFlag(near: boolean, oddRow: boolean, height: (di: number, dj: number) => number | undefined): number {
  if (!near) return 0;
  const lo = oddRow ? 0 : -1;
  const ring: readonly [number, number][] = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [lo, -1],
    [lo + 1, -1],
    [lo, 1],
    [lo + 1, 1],
  ];
  for (const [di, dj] of ring) {
    const h = height(di, dj);
    if (h !== undefined && h <= SEA_LEVEL) return 0;
  }
  return 1;
}

/**
 * A vertex of a refined town triangle (#87): the point `i / N` of the way
 * from corner a to b and `j / N` from a to c, its height the triangle's
 * plane blended to the field by the corners' town flags, so along an edge
 * whose ends are both unflagged it lies on the coarse edge. Written into
 * `out` as [x, y, z]. `buildLandMesh` draws these and `landSurface` samples
 * them, so the two agree.
 */
function refinedVertex(
  field: Pick<TerrainHeightField, "sampleHeight">,
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  c: readonly [number, number, number, number],
  i: number,
  j: number,
  out: [number, number, number]
): [number, number, number] {
  const N = TOWN_REFINE;
  const wb = i / N;
  const wc = j / N;
  const wa = (N - i - j) / N;
  const x = a[0] * wa + b[0] * wb + c[0] * wc;
  const z = a[2] * wa + b[2] * wb + c[2] * wc;
  const plane = a[1] * wa + b[1] * wb + c[1] * wc;
  const m = a[3] * wa + b[3] * wb + c[3] * wc;
  out[0] = x;
  out[1] = m > 0 ? plane + m * (field.sampleHeight(x, z) - plane) : plane;
  out[2] = z;
  return out;
}

/** Lattice edge length in world units (a hex is 2 units across); fine enough to resolve the interior relief. */
export const LAND_MESH_SPACING = 0.15;
/**
 * Triangles whose highest vertex is below this depth are dropped: from
 * VISIBLE_SEABED_DEPTH down the seabed contributes under 1% of the water's
 * colour (Beer–Lambert and the shader's fade, waterOptics.ts), and the ocean
 * shader treats missing seabed as deep water (#38).
 */
export const LAND_MESH_SKIRT_DEPTH = metresToUnits(VISIBLE_SEABED_DEPTH);

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

/** Per-vertex attributes: xyz positions, linear rgb colours and unit normals. */
export interface LandMeshArrays {
  positions: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
}

export interface LandMeshData {
  /**
   * Triangles reaching above sea level: unindexed, 3 vertices per triangle,
   * with one colour and the face normal on all three (flat, low-poly).
   */
  land: LandMeshArrays;
  /**
   * Triangles wholly under water (seabed only the water shader sees): indexed,
   * one vertex per point with its own colour and the field's smooth normal.
   */
  seabed: LandMeshArrays & { index: Uint32Array };
  /** Land plus seabed triangles. */
  triangleCount: number;
  /** Land triangles (`land.positions.length / 9`). */
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

/** The fixed band and coral noise of a map that does not wrap (one that does gets a periodic one). */
const plainBandNoise = createPlaneNoise(mulberry32(BAND_NOISE_SEED), null);

/** Two-octave boundary noise in [-1, 1]. */
function boundaryNoise(noise: PlaneNoise, x: number, z: number): number {
  const f = BAND_NOISE_FREQUENCY;
  return 0.7 * noise(x, z, f) + 0.3 * noise(x, z, f * 2.3, 41.2, -13.5);
}

/** Coral cover (0 … 1) of a patch at (x, z): reef heads separated by sand channels. */
function coralPatch(noise: PlaneNoise, x: number, z: number): number {
  const f = CORAL_FREQUENCY;
  const n = 0.7 * noise(x, z, f, 211.3, -87.1) + 0.3 * noise(x, z, f * 2.7, -19.9, 63.4);
  return CORAL_MAX_COVER * smoothstep(CORAL_COVER[0], CORAL_COVER[1], n);
}

/** Hash in [0, 1) for small per-face colour variation. */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The triangular lattice the land mesh is built on, from the field's bounds and period. */
interface LandLattice {
  minX: number;
  minZ: number;
  spacing: number;
  rowHeight: number;
  cols: number;
  rows: number;
  period: number | null;
  periodSteps: number;
}

/**
 * The lattice for a field. On a wrapping map (#36) the field's bounds are one
 * wrap width in x and the field repeats beyond them. The lattice then fits a
 * whole number of steps into that width, so copies of the mesh one wrap apart
 * share their edge vertices, and every look-up across the lattice's east/west
 * edge (relief occlusion, seabed normals) wraps round to the other side.
 * Vertex (i, j) sits at (minX + i·spacing [+ spacing/2 on odd rows], minZ + j·rowHeight).
 */
function landLattice(field: TerrainHeightField, requestedSpacing = LAND_MESH_SPACING): LandLattice {
  const { minX, maxX, minZ, maxZ } = field.bounds;
  const period = field.periodX;
  const periodSteps = period === null ? 0 : Math.max(1, Math.round(period / requestedSpacing));
  const spacing = period === null ? requestedSpacing : period / periodSteps;
  const rowHeight = spacing * (Math.sqrt(3) / 2);
  const cols = period === null ? Math.ceil((maxX - minX) / spacing) + 1 : periodSteps + 1;
  const rows = Math.ceil((maxZ - minZ) / rowHeight) + 1;
  return { minX, minZ, spacing, rowHeight, cols, rows, period, periodSteps };
}

/** Lattice column i, wrapped round on a periodic lattice, clamped to the edge otherwise. */
const latticeColumn = (lattice: LandLattice, i: number): number =>
  lattice.period === null ? Math.max(0, Math.min(lattice.cols - 1, i)) : ((i % lattice.periodSteps) + lattice.periodSteps) % lattice.periodSteps;

/**
 * The drawn land surface as a ground field: at a world point, the plane of
 * the lattice triangle under (x, z), through the field's heights at its
 * three vertices. The field is what the lattice samples, so between lattice
 * points the two differ by the ground's curvature over a step (up to a few
 * hundredths on a beach); anything that must sit on the ground as it is
 * drawn (the port buildings and quays) asks here, not the field. Each
 * lattice vertex is sampled once and kept, so a cluster of probes costs
 * about one field sample each. The triangulation is the one `buildLandMesh`
 * emits: between an even row j and the (right-shifted) odd row above it, up
 * triangles (a_i, b_i, a_i+1) and down triangles (a_i+1, b_i, b_i+1);
 * between an odd row and the even row above, (b_i, b_i+1, a_i) and
 * (a_i, b_i+1, a_i+1).
 */
export function landSurface(field: TerrainHeightField, spacing = LAND_MESH_SPACING): GroundField {
  const lattice = landLattice(field, spacing);
  const { minX, minZ, rowHeight, rows, cols } = lattice;
  const step = lattice.spacing;
  const heights = new Map<number, number>();
  // Lattice corners near a town flag its triangles for refinement (#87), as `buildLandMesh` does.
  const town = townGround(field.townPlateaus, lattice.period, TOWN_FLAG_MARGIN);
  const flags = new Map<number, number>();
  const heightOf = (ii: number, jj: number): number => {
    const column = latticeColumn(lattice, ii);
    const key = jj * cols + column;
    let h = heights.get(key);
    if (h === undefined) {
      h = field.sampleHeight(minX + column * step + (jj % 2 === 1 ? step / 2 : 0), minZ + jj * rowHeight);
      heights.set(key, h);
    }
    return h;
  };
  // Corners as built, per lattice point (unwrapped column, so a copy's x is its own).
  const corners = new Map<number, [number, number, number, number]>();
  /** A lattice corner as [x, height, z, town flag]; the same array each time it is asked. */
  const vertex = (ii: number, jj: number): [number, number, number, number] => {
    const cornerKey = jj * 4_194_304 + ii + 2_097_152;
    let corner = corners.get(cornerKey);
    if (!corner) {
      corner = buildVertex(ii, jj);
      corners.set(cornerKey, corner);
    }
    return corner;
  };
  const buildVertex = (ii: number, jj: number): [number, number, number, number] => {
    const shift = jj % 2 === 1 ? step / 2 : 0;
    const column = latticeColumn(lattice, ii);
    const key = jj * cols + column;
    const h = heightOf(ii, jj);
    let flag = 0;
    if (town) {
      const known = flags.get(key);
      // Heights as the mesh stores them (single precision), so both agree on what is above the sea.
      flag =
        known ??
        townFlag(town.flag(minX + column * step + shift, minZ + jj * rowHeight), jj % 2 === 1, (di, dj) =>
          jj + dj < 0 || jj + dj >= rows ? undefined : Math.fround(heightOf(ii + di, jj + dj))
        );
      if (known === undefined) flags.set(key, flag);
    }
    return [minX + ii * step + shift, h, minZ + jj * rowHeight, flag];
  };
  // The refined town triangles' sub-vertex heights, sampled once each too: per lattice triangle (its first
  // corner's lattice index and which of the four triangle shapes it is), a lazily filled grid.
  const N = TOWN_REFINE;
  const subCount = ((N + 1) * (N + 2)) / 2;
  const subGrids = new Map<number, Float64Array>();
  const scratch: [number, number, number] = [0, 0, 0];
  type Corner = [number, number, number, number];
  const subY = (grid: Float64Array, a: Corner, b: Corner, c: Corner, i: number, j: number): number => {
    const o = (i * (2 * N + 3 - i)) / 2 + j;
    if (Number.isNaN(grid[o])) grid[o] = refinedVertex(field, a, b, c, i, j, scratch)[1];
    return grid[o];
  };
  return {
    creasesWithin: (x, z, radius) => {
      // The lattice vertices inside the disc...
      const points: { x: number; z: number }[] = [];
      const j0 = Math.max(0, Math.ceil((z - radius - minZ) / rowHeight));
      const j1 = Math.min(rows - 1, Math.floor((z + radius - minZ) / rowHeight));
      for (let j = j0; j <= j1; j++) {
        const shift = j % 2 === 1 ? step / 2 : 0;
        const vz = minZ + j * rowHeight;
        const i0 = Math.ceil((x - radius - minX - shift) / step);
        const i1 = Math.floor((x + radius - minX - shift) / step);
        for (let i = i0; i <= i1; i++) {
          const vx = minX + i * step + shift;
          if (Math.hypot(vx - x, vz - z) <= radius) points.push({ x: vx, z: vz });
        }
      }
      // ...and where the lattice's edges cross its rim: the edges run along
      // three families of parallel lines (the rows, and the two diagonals at
      // 60° and 120°), each `rowHeight` apart, through the vertex (0, 0).
      const h = Math.sqrt(3) / 2;
      for (const f of [
        { n: [0, 1], d: [1, 0], c: minZ },
        { n: [-h, 0.5], d: [0.5, h], c: -h * minX + 0.5 * minZ },
        { n: [h, 0.5], d: [-0.5, h], c: h * minX + 0.5 * minZ },
      ]) {
        const centre = f.n[0] * x + f.n[1] * z;
        const k0 = Math.ceil((centre - radius - f.c) / rowHeight);
        const k1 = Math.floor((centre + radius - f.c) / rowHeight);
        for (let k = k0; k <= k1; k++) {
          const off = f.c + k * rowHeight - centre;
          const t = Math.sqrt(Math.max(0, radius * radius - off * off));
          const fx = x + f.n[0] * off;
          const fz = z + f.n[1] * off;
          points.push({ x: fx + f.d[0] * t, z: fz + f.d[1] * t });
          if (t > 0) points.push({ x: fx - f.d[0] * t, z: fz - f.d[1] * t });
        }
      }
      return points;
    },
    sampleHeight: (x, z) => {
      const j = Math.max(0, Math.min(rows - 2, Math.floor((z - minZ) / rowHeight)));
      const v = (z - minZ) / rowHeight - j;
      const u = (x - minX) / step;
      // Column index and fraction in the unshifted row of the pair (row j when even, row j + 1 when odd).
      const i = Math.floor(u);
      const f = u - i;
      let a: Corner;
      let b: Corner;
      let c: Corner;
      // The first corner's lattice cell and the triangle's shape (0–3), which name the triangle for `subGrids`.
      let anchorI = i;
      let anchorJ = j;
      let shape: number;
      if (j % 2 === 0) {
        // Row j unshifted, row j + 1 shifted right by half a step.
        shape = 0;
        if (f < v / 2) {
          a = vertex(i, j);
          b = vertex(i - 1, j + 1);
          c = vertex(i, j + 1);
        } else if (f > 1 - v / 2) {
          a = vertex(i + 1, j);
          b = vertex(i, j + 1);
          c = vertex(i + 1, j + 1);
          anchorI = i + 1;
        } else {
          a = vertex(i, j);
          b = vertex(i, j + 1);
          c = vertex(i + 1, j);
          shape = 1;
        }
      } else {
        // Row j shifted right by half a step, row j + 1 unshifted.
        const w = 1 - v;
        shape = 2;
        if (f < w / 2) {
          a = vertex(i - 1, j);
          b = vertex(i, j + 1);
          c = vertex(i, j);
          anchorI = i - 1;
        } else if (f > 1 - w / 2) {
          a = vertex(i, j);
          b = vertex(i + 1, j + 1);
          c = vertex(i + 1, j);
        } else {
          a = vertex(i, j + 1);
          b = vertex(i + 1, j + 1);
          c = vertex(i, j);
          anchorJ = j + 1;
          shape = 3;
        }
      }
      const ax = a[0];
      const ay = a[1];
      const az = a[2];
      const bx = b[0];
      const by = b[1];
      const bz = b[2];
      const cx = c[0];
      const cy = c[1];
      const cz = c[2];
      const det = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      const wb = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / det;
      const wc = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / det;
      // Only triangles wholly above the sea are refined (`isRefined`), as the mesh stores its heights (single precision).
      if (!isRefined(a[3] + b[3] + c[3], Math.fround(ay), Math.fround(by), Math.fround(cy))) return ay + wb * (by - ay) + wc * (cy - ay);
      // A refined town triangle (#87): the plane of the sub-triangle under the point, as `buildLandMesh` draws it.
      const key = ((anchorJ * cols + latticeColumn(lattice, anchorI)) << 2) + shape;
      let grid = subGrids.get(key);
      if (!grid) {
        grid = new Float64Array(subCount).fill(NaN);
        subGrids.set(key, grid);
      }
      const fi = Math.max(0, wb * N);
      const fj = Math.max(0, wc * N);
      const si = Math.min(N - 1, Math.floor(fi));
      const sj = Math.min(N - 1 - si, Math.floor(fj));
      const su = fi - si;
      const sv = fj - sj;
      if (su + sv <= 1 || si + sj === N - 1) {
        return subY(grid, a, b, c, si, sj) * (1 - su - sv) + subY(grid, a, b, c, si + 1, sj) * su + subY(grid, a, b, c, si, sj + 1) * sv;
      }
      return subY(grid, a, b, c, si + 1, sj + 1) * (su + sv - 1) + subY(grid, a, b, c, si, sj + 1) * (1 - su) + subY(grid, a, b, c, si + 1, sj) * (1 - sv);
    },
  };
}

/** The height of the drawn land surface at one world point (`landSurface` for a single probe). */
export const landSurfaceHeight = (field: TerrainHeightField, x: number, z: number, spacing = LAND_MESH_SPACING): number =>
  landSurface(field, spacing).sampleHeight(x, z);

export function buildLandMesh(
  field: TerrainHeightField,
  options: LandMeshOptions = {}
): LandMeshData {
  const skirtDepth = options.skirtDepth ?? LAND_MESH_SKIRT_DEPTH;
  const skipOpenWater = options.skipOpenWater ?? true;
  const palette = options.colors ?? DEFAULT_COLORS;
  const occlusion = options.occlusion ?? LAND_MESH_OCCLUSION;
  const { sampleReef } = options;
  const lattice = landLattice(field, options.spacing);
  const { minX, minZ, spacing, rowHeight, cols, rows, period } = lattice;
  const column = (i: number): number => latticeColumn(lattice, i);
  const bandNoise = period === null ? plainBandNoise : createPlaneNoise(mulberry32(BAND_NOISE_SEED), period);

  // Lattice vertex (i, j) sits at (minX + i·spacing [+ spacing/2 on odd rows], minZ + j·rowHeight).
  // Precomputed: these are read for every output vertex.
  const latticeX = new Float64Array(cols * rows);
  const latticeZ = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const shift = j % 2 === 1 ? spacing / 2 : 0;
    for (let i = 0; i < cols; i++) {
      latticeX[j * cols + i] = minX + i * spacing + shift;
      latticeZ[j * cols + i] = minZ + j * rowHeight;
    }
  }
  const vertexX = (v: number) => latticeX[v];
  const vertexZ = (v: number) => latticeZ[v];

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
      const jj = Math.max(0, Math.min(rows - 1, j + dj));
      return heightAt(jj * cols + column(i + di));
    };
    const half = ring / 2;
    const mean =
      (at(ring, 0) + at(-ring, 0) + at(half, ring) + at(-half, ring) + at(half, -ring) + at(-half, -ring)) / 6;
    cavityAt[v] = mean - heightAt(v);
    return cavityAt[v];
  };

  const latticeSize = cols * rows;
  const pointX = vertexX;
  const pointZ = vertexZ;
  const pointY = (p: number) => vy[p];
  const pointCavity = (p: number) => (occlusion <= 0 ? 0 : vertexCavity(p));

  // Pass 2: sort the kept triangles into land (reaching above sea level) and seabed.
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
  for (let t = 0; t < triangleCount; t++) {
    const a = kept[t * 3];
    const b = kept[t * 3 + 1];
    const c = kept[t * 3 + 2];
    push3(Math.max(vy[a], vy[b], vy[c]) > SEA_LEVEL ? land : seabed, a, b, c);
  }

  // The town ground (#87): land triangles with a corner near a town are cut
  // into TOWN_REFINE² triangles sampling the field (`refinedVertex`). Their
  // edges are cut in TOWN_REFINE; an unrefined land neighbour across one is
  // drawn as a coplanar fan to those cuts, so no T-junction opens.
  const town = townGround(field.townPlateaus, period, TOWN_FLAG_MARGIN);
  const flagOf = new Int8Array(town ? latticeSize : 0).fill(-1);
  const flagged = (v: number): number => {
    if (!town) return 0;
    if (flagOf[v] < 0) {
      const j = Math.floor(v / cols);
      const i = v - j * cols;
      flagOf[v] = townFlag(town.flag(pointX(v), pointZ(v)), j % 2 === 1, (di, dj) =>
        j + dj < 0 || j + dj >= rows ? undefined : heightAt((j + dj) * cols + column(i + di))
      );
    }
    return flagOf[v];
  };
  const landTriangles = land.length / 3;
  const refined = new Uint8Array(landTriangles);
  const edgeKey = (a: number, b: number) => (a < b ? a * latticeSize + b : b * latticeSize + a);
  const cutEdges = new Set<number>();
  // Lattice vertices on a cut edge: only a triangle with one of them as a corner can border a refined one.
  const onCut = new Uint8Array(town ? latticeSize : 0);
  if (town) {
    for (let t = 0; t < landTriangles; t++) {
      const a = land.data[t * 3];
      const b = land.data[t * 3 + 1];
      const c = land.data[t * 3 + 2];
      if (!isRefined(flagged(a) + flagged(b) + flagged(c), pointY(a), pointY(b), pointY(c))) continue;
      refined[t] = 1;
      cutEdges.add(edgeKey(a, b));
      cutEdges.add(edgeKey(b, c));
      cutEdges.add(edgeKey(c, a));
      onCut[a] = onCut[b] = onCut[c] = 1;
    }
  }
  const cutsOf = (t: number): number => {
    if (cutEdges.size === 0) return 0;
    const a = land.data[t * 3];
    const b = land.data[t * 3 + 1];
    const c = land.data[t * 3 + 2];
    if (!onCut[a] && !onCut[b] && !onCut[c]) return 0;
    let cuts = 0;
    for (let k = 0; k < 3; k++) if (cutEdges.has(edgeKey(land.data[t * 3 + k], land.data[t * 3 + ((k + 1) % 3)]))) cuts++;
    return cuts;
  };
  let aboveWaterTriangleCount = 0;
  for (let t = 0; t < landTriangles; t++) {
    if (refined[t]) aboveWaterTriangleCount += TOWN_REFINE * TOWN_REFINE;
    else {
      const cuts = cutsOf(t);
      aboveWaterTriangleCount += cuts > 0 ? 3 + (TOWN_REFINE - 1) * cuts : 1;
    }
  }
  const positions = new Float32Array(aboveWaterTriangleCount * 9);
  const colors = new Float32Array(aboveWaterTriangleCount * 9);
  const normals = new Float32Array(aboveWaterTriangleCount * 9);
  const writePoint = (o: number, p: number) => {
    positions[o] = pointX(p);
    positions[o + 1] = pointY(p);
    positions[o + 2] = pointZ(p);
  };
  /** Writes one flat-shaded triangle (nine coordinates) with its colour and normal at output slot `out`. */
  const writeFace = (out: number, p: ArrayLike<number>, rgb: Rgb, n: readonly [number, number, number]) => {
    for (let k = 0; k < 3; k++) {
      const o = out * 9 + k * 3;
      positions[o] = p[k * 3];
      positions[o + 1] = p[k * 3 + 1];
      positions[o + 2] = p[k * 3 + 2];
      colors[o] = rgb[0];
      colors[o + 1] = rgb[1];
      colors[o + 2] = rgb[2];
      normals[o] = n[0];
      normals[o + 1] = n[1];
      normals[o + 2] = n[2];
    }
  };

  // Land: flat, one normal and one colour per face, for the low-poly look.
  const sample: LandFaceSample = { height: 0, normalY: 1, noise: 0, cavity: 0, coral: 0 };
  let out = 0;
  const N = TOWN_REFINE;
  const subVertices = new Float64Array((((N + 1) * (N + 2)) / 2) * 4);
  const subIndex = (i: number, j: number) => ((i * (2 * N + 3 - i)) / 2 + j) * 4;
  const scratch: [number, number, number] = [0, 0, 0];
  const face = new Float64Array(9);
  const faceColor: [number, number, number] = [0, 0, 0];
  const faceNormal: [number, number, number] = [0, 0, 0];
  let coarseNoise = 0;
  /** Whether the refined triangle being emitted has any paving or lane on it. */
  let coarseSurfaced = false;
  /** One refined sub-triangle from sub-vertices p, q, r: coloured from its own height, slope and cavity, or the town's surface. */
  const emitSubFace = (p: number, q: number, r: number) => {
    face[0] = subVertices[p];
    face[1] = subVertices[p + 1];
    face[2] = subVertices[p + 2];
    face[3] = subVertices[q];
    face[4] = subVertices[q + 1];
    face[5] = subVertices[q + 2];
    face[6] = subVertices[r];
    face[7] = subVertices[r + 1];
    face[8] = subVertices[r + 2];
    const ux = face[3] - face[0];
    const uy = face[4] - face[1];
    const uz = face[5] - face[2];
    const wx = face[6] - face[0];
    const wy = face[7] - face[1];
    const wz = face[8] - face[2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    const cx = (face[0] + face[3] + face[6]) / 3;
    const cz = (face[2] + face[5] + face[8]) / 3;
    sample.height = (face[1] + face[4] + face[7]) / 3;
    sample.normalY = ny / nl;
    // The band noise varies over units, not sub-faces: the coarse triangle's serves them all.
    sample.noise = coarseNoise;
    sample.cavity = (subVertices[p + 3] + subVertices[q + 3] + subVertices[r + 3]) / 3;
    sample.coral = 0;
    const surface = town && coarseSurfaced ? town.surface(cx, cz) : "ground";
    // Setts and trodden earth vary more from face to face than the open ground.
    const rgb: Rgb = surface === "ground" ? landFaceColor(palette, sample, occlusion) : TOWN_SURFACE_COLORS[surface];
    const shade = surface === "ground" ? 0.93 + hash(cx, cz) * 0.14 : 0.8 + hash(cx * 1.7, cz * 1.3) * 0.36;
    faceColor[0] = rgb[0] * shade;
    faceColor[1] = rgb[1] * shade;
    faceColor[2] = rgb[2] * shade;
    faceNormal[0] = nx / nl;
    faceNormal[1] = ny / nl;
    faceNormal[2] = nz / nl;
    writeFace(out++, face, faceColor, faceNormal);
  };
  const cornerOf = (v: number): [number, number, number, number] => [pointX(v), pointY(v), pointZ(v), flagged(v)];
  for (let t = 0; t < landTriangles; t++) {
    const a = land.data[t * 3];
    const b = land.data[t * 3 + 1];
    const c = land.data[t * 3 + 2];
    if (refined[t]) {
      const ca = cornerOf(a);
      const cb = cornerOf(b);
      const cc = cornerOf(c);
      const cavA = pointCavity(a);
      const cavB = pointCavity(b);
      const cavC = pointCavity(c);
      const centroidX = (ca[0] + cb[0] + cc[0]) / 3;
      const centroidZ = (ca[2] + cb[2] + cc[2]) / 3;
      coarseNoise = boundaryNoise(bandNoise, centroidX, centroidZ);
      // A lattice triangle lies within a step's reach of its centroid.
      coarseSurfaced = town?.surfaceNear(centroidX, centroidZ, spacing) ?? false;
      for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N - i; j++) {
          refinedVertex(field, ca, cb, cc, i, j, scratch);
          const o = subIndex(i, j);
          subVertices[o] = scratch[0];
          subVertices[o + 1] = scratch[1];
          subVertices[o + 2] = scratch[2];
          subVertices[o + 3] = (cavA * (N - i - j) + cavB * i + cavC * j) / N;
        }
      }
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N - i; j++) {
          emitSubFace(subIndex(i, j), subIndex(i + 1, j), subIndex(i, j + 1));
          if (j < N - 1 - i) emitSubFace(subIndex(i + 1, j), subIndex(i + 1, j + 1), subIndex(i, j + 1));
        }
      }
      continue;
    }
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
    sample.noise = boundaryNoise(bandNoise, cx, cz);
    sample.cavity = (pointCavity(a) + pointCavity(b) + pointCavity(c)) / 3;
    const reef = sampleReef && sample.height <= SEA_LEVEL ? sampleReef(cx, cz) : 0;
    sample.coral = reef > 0 ? reef * coralPatch(bandNoise, cx, cz) : 0;
    const [r, g, bl] = landFaceColor(palette, sample, occlusion);
    const shade = 0.93 + hash(cx, cz) * 0.14;
    if (cutsOf(t) > 0) {
      // Next to a refined triangle: a fan from the centroid to the corners and
      // the cuts on the cut edges, in the same plane, colour and normal.
      const ring: number[] = [];
      const corners = [a, b, c];
      for (let k = 0; k < 3; k++) {
        const p = corners[k];
        const q = corners[(k + 1) % 3];
        ring.push(pointX(p), pointY(p), pointZ(p));
        if (!cutEdges.has(edgeKey(p, q))) continue;
        // The cuts as the refined side computes them: weights on the two ends, the third weight zero.
        for (let i = 1; i < N; i++) {
          const wq = i / N;
          const wp = (N - i) / N;
          ring.push(pointX(p) * wp + pointX(q) * wq, pointY(p) * wp + pointY(q) * wq, pointZ(p) * wp + pointZ(q) * wq);
        }
      }
      const centre = [ax + (ux + wx) / 3, (pointY(a) + pointY(b) + pointY(c)) / 3, az + (uz + wz) / 3];
      const count = ring.length / 3;
      const rgb: Rgb = [r * shade, g * shade, bl * shade];
      const n: [number, number, number] = [nx / nl, ny / nl, nz / nl];
      for (let e = 0; e < count; e++) {
        const f = (e + 1) % count;
        writeFace(out++, [centre[0], centre[1], centre[2], ring[e * 3], ring[e * 3 + 1], ring[e * 3 + 2], ring[f * 3], ring[f * 3 + 1], ring[f * 3 + 2]], rgb, n);
      }
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const o = out * 9 + k * 3;
      writePoint(o, land.data[t * 3 + k]);
      colors[o] = r * shade;
      colors[o + 1] = g * shade;
      colors[o + 2] = bl * shade;
      normals[o] = nx / nl;
      normals[o + 1] = ny / nl;
      normals[o + 2] = nz / nl;
    }
    out++;
  }

  // Seabed: smooth, with the field's own normal and a colour per point, so
  // no facets show through clear water.
  // Height gradient at a lattice vertex by central differences on the lattice
  // (neighbours along the row, and the two-vertex average straight above and
  // below it in the half-offset rows).
  const at = (ii: number, jj: number) => heightAt(Math.max(0, Math.min(rows - 1, jj)) * cols + column(ii));
  /** The height gradient at lattice vertex v, into grad[0..1]. */
  const grad = new Float64Array(2);
  const latticeGradient = (v: number) => {
    const j = Math.floor(v / cols);
    const i = v - j * cols;
    grad[0] = (at(i + 1, j) - at(i - 1, j)) / (2 * spacing);
    // Odd rows sit half a step right: the vertices flanking x in the row above
    // and below are (i−1, i) from an even row and (i, i+1) from an odd one.
    const lo = j % 2 === 0 ? i - 1 : i;
    const up = (at(lo, j + 1) + at(lo + 1, j + 1)) / 2;
    const down = (at(lo, j - 1) + at(lo + 1, j - 1)) / 2;
    grad[1] = (up - down) / (2 * rowHeight);
  };

  // Seabed vertices: one per lattice point, numbered in first-use order.
  const vertexOf = new Int32Array(latticeSize).fill(-1);
  const index = new Uint32Array(seabed.length);
  let vertexCount = 0;
  for (let i = 0; i < seabed.length; i++) {
    const p = seabed.data[i];
    if (vertexOf[p] < 0) vertexOf[p] = vertexCount++;
    index[i] = vertexOf[p];
  }
  const seabedPositions = new Float32Array(vertexCount * 3);
  const seabedColors = new Float32Array(vertexCount * 3);
  const seabedNormals = new Float32Array(vertexCount * 3);

  const shade = (p: number) => {
    latticeGradient(p);
    const nl = Math.sqrt(grad[0] * grad[0] + 1 + grad[1] * grad[1]);
    const x = pointX(p);
    const z = pointZ(p);
    sample.height = pointY(p);
    sample.normalY = 1 / nl;
    sample.noise = 0; // only the land bands use it
    sample.cavity = pointCavity(p);
    const reef = sampleReef ? sampleReef(x, z) : 0;
    sample.coral = reef > 0 ? reef * coralPatch(bandNoise, x, z) : 0;
    const [r, g, b] = landFaceColor(palette, sample, occlusion);
    const o = vertexOf[p] * 3;
    seabedPositions[o] = x;
    seabedPositions[o + 1] = pointY(p);
    seabedPositions[o + 2] = z;
    seabedNormals[o] = -grad[0] / nl;
    seabedNormals[o + 1] = 1 / nl;
    seabedNormals[o + 2] = -grad[1] / nl;
    seabedColors[o] = r;
    seabedColors[o + 1] = g;
    seabedColors[o + 2] = b;
  };
  for (let p = 0; p < vertexOf.length; p++) if (vertexOf[p] >= 0) shade(p);

  return {
    land: { positions, colors, normals },
    seabed: { positions: seabedPositions, colors: seabedColors, normals: seabedNormals, index },
    triangleCount: aboveWaterTriangleCount + seabed.length / 3,
    aboveWaterTriangleCount,
  };
}
