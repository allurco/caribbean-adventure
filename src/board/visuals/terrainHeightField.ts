/**
 * The one terrain height field (ADR 0001).
 *
 * A pure function of the map cells and a seed that every visual consumer
 * samples. No Three.js here so it stays unit-testable; GPU consumers bake a
 * texture from `sampleHeight`, CPU consumers call it directly.
 *
 *   height(p) = coast(d) where d = signed distance to the land/water hex
 *               boundary (+ on land, − on water) plus simplex noise.
 *   d ≤ 0  → seabed: the metric shelf and drop-off of `seabedProfile.ts`,
 *            raised to a 1–3 m deep crest over reef hexes (#38).
 *   d > 0  → blendedTarget(p) · ramp(d) + relief(p) · ramp(d)², where
 *            blendedTarget is a smooth kernel-weighted average of nearby land
 *            cells' elevation heights and relief is non-negative multi-octave
 *            noise (rolling low down, ridged on mountains) whose amplitude
 *            follows the blended elevation.
 *
 * Both branches are 0 at d = 0, so the coast sits at sea level, and land hex
 * edges are never boundary edges, so adjacent land hexes never dip.
 */
import type { MapCell } from "../../game/types";
import { hexToWorld, wrapWorldWidth, type MapWrap } from "../../game/hex";
import { createPlaneNoise, type PlaneNoise } from "./periodicNoise";
import { seamStrip, withSeamImages, wrapIntoStrip } from "./seamStrip";
import { seabedDepth } from "./seabedProfile";
import { metresToUnits, unitsToMetres } from "./worldScale";

/** World height that each land elevation rises to (1 beach, 2 jungle, 3 mountain). */
export const ELEVATION_HEIGHTS = { 1: 0.3, 2: 0.75, 3: 1.4 } as const;

/** Sea level in world Y. */
export const SEA_LEVEL = 0;

/** Max shoreline displacement from the hex edge, in world units. Must stay below the hex inradius (√3/2). */
export const COAST_NOISE_AMPLITUDE = 0.25;
const COAST_NOISE_FREQUENCY = 1.3;

/** Distance inland over which land rises from sea level to its target height. */
const SHORE_RAMP = 0.9;
/** Width of the soft toe where the land leaves the water (world units, ~12 m); see sampleHeight. */
const SHORE_TOE = 0.18;
/**
 * Coast distance is clamped to this; beyond it the field is flat. 4 units
 * (260 m) reaches past the seabed drop-off, where the profile is within a few
 * metres of its floor.
 */
const MAX_COAST_DISTANCE = 4;
/**
 * Coastline edges are indexed by every hex within this hex distance of their
 * land hex. A point in hex H within MAX_COAST_DISTANCE of an edge of land hex
 * L has |H − L| ≤ 1 + MAX_COAST_DISTANCE + 1 between centres, and hexes n
 * apart have centres at least 1.5·n apart, so n ≤ (MAX + 2) / 1.5.
 */
const COAST_INDEX_RADIUS = Math.floor((MAX_COAST_DISTANCE + 2) / 1.5);
/**
 * Padding of the field's bounds around the outermost cell centres. An island
 * can sit on the map's edge column: its coast is up to a hex circumradius (1) from its
 * centre, and the seabed only levels out MAX_COAST_DISTANCE beyond the coast,
 * so anything less cuts off its shelf and drop-off along a straight line
 * (the prepass then finds no seabed there). Past this the field is flat, and
 * nothing samples outside it, so the bounds never assume hard map edges (#36).
 */
const BOUNDS_PADDING = MAX_COAST_DISTANCE + 1;
/**
 * How far past the strip's edges a wrapping field copies cells from the other
 * side (#36): a point in the strip reads coast edges indexed up to
 * COAST_INDEX_RADIUS hexes from a land hex, i.e. land up to ~MAX_COAST_DISTANCE
 * + 2 away; a few units more cover the reef and blend look-ups with room.
 */
const SEAM_IMAGE_MARGIN = MAX_COAST_DISTANCE + 4;
/**
 * Reef rise (#38): reef hexes rise to a crest REEF_CREST_DEPTH ± REEF_CREST_VARIATION
 * metres below the surface. The rise starts REEF_FOOT outside the reef outline
 * and reaches the crest REEF_TOP inside it (world units), so the steepest
 * reef front stays below ~70° and the crest covers the middle of the hex.
 */
const REEF_CREST_DEPTH = 2;
const REEF_CREST_VARIATION = 0.9;
const REEF_CREST_FREQUENCY = 1.6;
const REEF_FOOT = 0.6;
const REEF_TOP = 0.4;
/** Smooth-max width (metres) where the reef crest meets an already shallow shelf. */
const REEF_BLEND = 1;
/** Hexes within this distance of land may have seabed above the visible-seabed cut-off (see isNearSeabed). */
const SEABED_LAND_RADIUS = 3;
/**
 * Elevation blend kernel radius. 2 reaches adjacent centres (√3 apart) with a
 * small weight and never reaches ring-2 centres from inside a hex, so the
 * blend only needs a hex and its 6 neighbours.
 */
const BLEND_RADIUS = 2;
/**
 * Peak interior relief by elevation (1 beach, 2 jungle, 3 mountain), linearly
 * interpolated on the blended elevation so it never seams at hex edges. Relief
 * only ever raises the ground (0 … amplitude), so it can't cut a dip between
 * land hexes or reorder beach < jungle < mountain at cell centres.
 */
export const RELIEF_AMPLITUDES = { 1: 0.05, 2: 0.16, 3: 0.5 } as const;
/** Base relief frequency in cycles per world unit (a hex is ~1.7 across). */
const RELIEF_FREQUENCY = 0.7;
/**
 * Noise octaves; each doubles the frequency and scales the weight by
 * RELIEF_GAIN. A third octave is finer than the land mesh resolves and only
 * adds spikes.
 */
const RELIEF_OCTAVES = 2;
const RELIEF_GAIN = 0.4;
/** Exponent on the ridged term (1 − |n|): higher gives narrower crests and broader valleys. */
const RIDGE_SHARPNESS = 2;
/**
 * Rounds the crease at each ridge crest (|n| becomes √(n² + s²) − s), which
 * caps the steepest slope so peaks don't turn into spikes.
 */
const RIDGE_SOFTNESS = 0.15;
const RIDGE_SOFT_MAX = Math.sqrt(1 + RIDGE_SOFTNESS * RIDGE_SOFTNESS) - RIDGE_SOFTNESS;

const SQRT3 = Math.sqrt(3);
const HEX_DIRS: readonly [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export interface TerrainBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TerrainHeightFieldOptions {
  /** Override the shoreline noise amplitude (0 makes the coast trace hex edges exactly). */
  coastNoiseAmplitude?: number;
  /** Scale the interior relief (0 leaves only the smooth blended target, e.g. as a test baseline). */
  reliefScale?: number;
  /**
   * The map's east–west wrap. With one, the whole field repeats every wrap
   * width in x: the noise is periodic, and coasts and reefs are drawn across
   * the seam from the cells on the other side (#36).
   */
  wrap?: MapWrap;
}

export interface TerrainHeightField {
  /** Terrain height (world Y) at world (x, z). ~0 at the coast, negative over water. */
  sampleHeight: (x: number, z: number) => number;
  /** Noise-perturbed signed distance to the coast: positive on land, negative over water, clamped to ±2. */
  sampleCoastDistance: (x: number, z: number) => number;
  /** Blended land elevation (1 beach … 3 mountain) at (x, z); 0 where no land cell is near. */
  sampleElevation: (x: number, z: number) => number;
  /**
   * Cheap test: is the hex containing (x, z) land or next to land? Where it is
   * false the point is open water at least 1 − coastNoiseAmplitude offshore.
   */
  isNearLand: (x: number, z: number) => boolean;
  /**
   * Cheap test: is the hex containing (x, z) within 3 hexes of land or next to
   * a reef? Where it is false the seabed is deeper than the mesh cut-off, deep enough
   * that clear water hides it, so seabed geometry can skip it.
   */
  isNearSeabed: (x: number, z: number) => boolean;
  /**
   * World-space XZ extent the field is built over. Without a wrap: the cell
   * centres padded past the seabed drop-off. With one: in x, exactly one wrap
   * width (`seamStrip.ts`), which the field repeats beyond.
   */
  bounds: TerrainBounds;
  /** The world width the field repeats over in x (the wrap width), or null. */
  periodX: number | null;
}

/** Seeded PRNG (mulberry32), same as the map generator's. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic seed for the field derived from the map itself, so every
 * client and every consumer gets the same coastline without storing a seed in G.
 */
export function terrainSeedFromCells(cells: readonly MapCell[]): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h = Math.imul(h ^ (n & 0xffff), 0x01000193);
  };
  for (const cell of cells) {
    if (cell.terrain !== "island") continue;
    mix(cell.hex.q + 1024);
    mix(cell.hex.r + 1024);
    mix(cell.elevation);
  }
  return h >>> 0;
}

const KEY_OFFSET = 1024;
const KEY_WIDTH = 2048;
const hexKey = (q: number, r: number): number => (q + KEY_OFFSET) * KEY_WIDTH + (r + KEY_OFFSET);

/** Flat-top world (x, z) → the axial hex containing it (inverse of hexToWorld, cube-rounded). */
function worldToHexKey(x: number, z: number): number {
  const qf = (2 / 3) * x;
  const rf = z / SQRT3 - x / 3;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return hexKey(q, r);
}

/** Visit every axial hex within `radius` of (q, r). */
function forEachHexWithin(q: number, r: number, radius: number, visit: (q: number, r: number) => void): void {
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) visit(q + dq, r + dr);
  }
}

/** Squared distance from (px, pz) to segment (a, b); callers take one sqrt of the minimum. */
function pointSegmentDistanceSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const ex = bx - ax;
  const ez = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez)));
  const dx = px - (ax + ex * t);
  const dz = pz - (az + ez * t);
  return dx * dx + dz * dz;
}

function elevationHeight(elevation: number): number {
  if (elevation >= 3) return ELEVATION_HEIGHTS[3];
  if (elevation === 2) return ELEVATION_HEIGHTS[2];
  return ELEVATION_HEIGHTS[1];
}

/** Two-octave simplex noise in [-1, 1] at world (x, z), base `frequency` in cycles per unit. */
function fbm2(noise: PlaneNoise, x: number, z: number, frequency: number): number {
  return 0.67 * noise(x, z, frequency) + 0.33 * noise(x, z, frequency * 2.1, 17.3, -5.7);
}

/** Peak relief amplitude at a blended elevation (1 … 3). */
function reliefAmplitude(elevation: number): number {
  if (elevation <= 1) return RELIEF_AMPLITUDES[1];
  if (elevation <= 2) return RELIEF_AMPLITUDES[1] + (RELIEF_AMPLITUDES[2] - RELIEF_AMPLITUDES[1]) * (elevation - 1);
  return RELIEF_AMPLITUDES[2] + (RELIEF_AMPLITUDES[3] - RELIEF_AMPLITUDES[2]) * Math.min(1, elevation - 2);
}

const RELIEF_WEIGHT_SUM = (() => {
  let sum = 0;
  for (let i = 0, w = 1; i < RELIEF_OCTAVES; i++, w *= RELIEF_GAIN) sum += w;
  return sum;
})();

/**
 * Interior relief shape in [0, 1]: rolling fBm on low ground, blending to a
 * ridged multifractal (crests where the noise crosses zero) from jungle up to
 * mountain, so mountains get peaks and ridgelines rather than taller humps.
 */
function reliefShape(noise: PlaneNoise, x: number, z: number, elevation: number): number {
  let rolling = 0;
  let ridged = 0;
  let frequency = RELIEF_FREQUENCY;
  let weight = 1;
  for (let i = 0; i < RELIEF_OCTAVES; i++) {
    // Offset each octave so their lattices don't line up.
    const n = noise(x, z, frequency, i * 31.7, -i * 17.9);
    rolling += weight * n;
    const softAbs = (Math.sqrt(n * n + RIDGE_SOFTNESS * RIDGE_SOFTNESS) - RIDGE_SOFTNESS) / RIDGE_SOFT_MAX;
    ridged += weight * Math.pow(1 - softAbs, RIDGE_SHARPNESS);
    frequency *= 2;
    weight *= RELIEF_GAIN;
  }
  rolling = 0.5 + (0.5 * rolling) / RELIEF_WEIGHT_SUM;
  ridged /= RELIEF_WEIGHT_SUM;
  const ridgeMix = Math.max(0, Math.min(1, elevation - 2));
  return rolling + (ridged - rolling) * ridgeMix;
}

/**
 * Build the terrain height field for a map. Cost is linear in the number of
 * coastline edges; sampling is O(1) (a hex lookup plus ~a dozen nearby edges).
 */
export function createTerrainHeightField(
  cells: readonly MapCell[],
  seed: number,
  options: TerrainHeightFieldOptions = {}
): TerrainHeightField {
  const coastNoiseAmplitude = options.coastNoiseAmplitude ?? COAST_NOISE_AMPLITUDE;
  const rng = mulberry32(seed);
  const reliefScale = options.reliefScale ?? 1;
  const noisePeriod = options.wrap ? wrapWorldWidth(options.wrap) : null;
  const coastNoise = createPlaneNoise(rng, noisePeriod);
  const reliefNoise = createPlaneNoise(rng, noisePeriod);
  // Drawn after the others so adding it left the coast and relief unchanged.
  const reefNoise = createPlaneNoise(rng, noisePeriod);

  // On a wrapping map the field is built over one strip a wrap wide, from the
  // cells plus their images just past either edge, and every sampler moves its
  // point into the strip first: so it repeats exactly every wrap width, and
  // islands, coasts and reefs carry on across the seam (#36).
  const strip = seamStrip(options.wrap ?? null);
  const sourceCells = withSeamImages(cells, options.wrap ?? null, SEAM_IMAGE_MARGIN);
  const inStrip = strip ? (x: number) => wrapIntoStrip(x, strip) : (x: number) => x;

  // Land elevation by hex; anything else (water, reef, off-map) is sea.
  const landElevation = new Map<number, number>();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const cell of cells) {
    const [x, , z] = hexToWorld(cell.hex);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  for (const cell of sourceCells) {
    if (cell.terrain === "island") {
      landElevation.set(hexKey(cell.hex.q, cell.hex.r), Math.max(1, Math.min(3, cell.elevation)));
    }
  }
  if (!Number.isFinite(minX)) {
    minX = maxX = minZ = maxZ = 0;
  }
  const bounds: TerrainBounds = {
    minX: strip ? strip.minX : minX - BOUNDS_PADDING,
    maxX: strip ? strip.minX + strip.width : maxX + BOUNDS_PADDING,
    minZ: minZ - BOUNDS_PADDING,
    maxZ: maxZ + BOUNDS_PADDING,
  };

  // Coastline segments (shared edge of a land hex and a non-land neighbour),
  // indexed by every hex within COAST_INDEX_RADIUS of the land side, which
  // makes the clamped distance exact (see COAST_INDEX_RADIUS).
  const segmentsNear = new Map<number, number[]>();
  // Hexes whose seabed can be shallower than the visible-seabed cut-off.
  const nearSeabed = new Set<number>();
  // Land centres (x, z, targetHeight, elevation) for each hex and its neighbours.
  const landNear = new Map<number, number[]>();

  for (const cell of sourceCells) {
    if (cell.terrain !== "island") continue;
    const { q, r } = cell.hex;
    const [cx, , cz] = hexToWorld(cell.hex);
    const elevation = landElevation.get(hexKey(q, r)) ?? 1;

    forEachHexWithin(q, r, 1, (nq, nr) => {
      const k = hexKey(nq, nr);
      let list = landNear.get(k);
      if (!list) landNear.set(k, (list = []));
      list.push(cx, cz, elevationHeight(elevation), elevation);
    });
    forEachHexWithin(q, r, SEABED_LAND_RADIUS, (nq, nr) => nearSeabed.add(hexKey(nq, nr)));

    for (const [dq, dr] of HEX_DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      if (landElevation.has(hexKey(nq, nr))) continue;
      const [nx, , nz] = hexToWorld({ q: nq, r: nr, s: -nq - nr });
      // The shared edge: through the midpoint of the centres, perpendicular to
      // them, half-length 0.5 (edge length equals hex size 1).
      const mx = (cx + nx) / 2;
      const mz = (cz + nz) / 2;
      const ux = (nx - cx) / SQRT3;
      const uz = (nz - cz) / SQRT3;
      const segment = [mx - uz * 0.5, mz + ux * 0.5, mx + uz * 0.5, mz - ux * 0.5];
      forEachHexWithin(q, r, COAST_INDEX_RADIUS, (hq, hr) => {
        const k = hexKey(hq, hr);
        let list = segmentsNear.get(k);
        if (!list) segmentsNear.set(k, (list = []));
        list.push(...segment);
      });
    }
  }

  // Reef outline segments (edges between a reef hex and a non-reef hex),
  // indexed by every hex within 1 of the reef hex: a point within REEF_FOOT
  // (< 1) of an outline edge lies in the reef hex or one of its neighbours.
  const reefHexes = new Set<number>();
  for (const cell of sourceCells) {
    if (cell.terrain === "reef") reefHexes.add(hexKey(cell.hex.q, cell.hex.r));
  }
  const reefSegmentsNear = new Map<number, number[]>();
  for (const cell of sourceCells) {
    if (cell.terrain !== "reef") continue;
    const { q, r } = cell.hex;
    const [cx, , cz] = hexToWorld(cell.hex);
    forEachHexWithin(q, r, 1, (nq, nr) => {
      const k = hexKey(nq, nr);
      nearSeabed.add(k);
      if (!reefSegmentsNear.has(k)) reefSegmentsNear.set(k, []);
    });
    for (const [dq, dr] of HEX_DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      if (reefHexes.has(hexKey(nq, nr))) continue;
      const [nx, , nz] = hexToWorld({ q: nq, r: nr, s: -nq - nr });
      const mx = (cx + nx) / 2;
      const mz = (cz + nz) / 2;
      const ux = (nx - cx) / SQRT3;
      const uz = (nz - cz) / SQRT3;
      const segment = [mx - uz * 0.5, mz + ux * 0.5, mx + uz * 0.5, mz - ux * 0.5];
      forEachHexWithin(q, r, 1, (hq, hr) => reefSegmentsNear.get(hexKey(hq, hr))?.push(...segment));
    }
  }
  const reefSegmentArrays = new Map<number, Float64Array>();
  for (const [k, list] of reefSegmentsNear) reefSegmentArrays.set(k, Float64Array.from(list));

  /**
   * How far the reef rise has got at (x, z), 0 … 1: 0 more than REEF_FOOT
   * outside every reef outline, 1 from REEF_TOP inside one.
   */
  const reefRise = (x: number, z: number): number => {
    const k = worldToHexKey(x, z);
    const segments = reefSegmentArrays.get(k);
    if (!segments) return 0;
    let distSq = Infinity;
    for (let i = 0; i < segments.length; i += 4) {
      const d = pointSegmentDistanceSq(x, z, segments[i], segments[i + 1], segments[i + 2], segments[i + 3]);
      if (d < distSq) distSq = d;
    }
    const dist = Math.sqrt(distSq);
    const signed = reefHexes.has(k) ? dist : -dist;
    const t = Math.max(0, Math.min(1, (signed + REEF_FOOT) / (REEF_FOOT + REEF_TOP)));
    return t * t * (3 - 2 * t);
  };

  // Each hex's segments sorted by distance from the hex centre, as
  // [ax, az, bx, bz, centreDistance − 1, …]. Every point of the hex is within 1
  // (the circumradius) of its centre, so the last value is a lower bound on a
  // segment's distance from any point in the hex, and the scan in
  // sampleCoastDistance can stop at the first segment whose bound exceeds the
  // best distance so far: the result is exact.
  const SEGMENT_STRIDE = 5;
  const segmentArrays = new Map<number, Float64Array>();
  for (const [k, list] of segmentsNear) {
    const q = Math.floor(k / KEY_WIDTH) - KEY_OFFSET;
    const r = (k % KEY_WIDTH) - KEY_OFFSET;
    const [cx, , cz] = hexToWorld({ q, r, s: -q - r });
    const order: number[] = [];
    const bound: number[] = [];
    for (let i = 0; i < list.length; i += 4) {
      order.push(i);
      bound.push(Math.sqrt(pointSegmentDistanceSq(cx, cz, list[i], list[i + 1], list[i + 2], list[i + 3])) - 1);
    }
    order.sort((a, b) => bound[a / 4] - bound[b / 4]);
    const sorted = new Float64Array(order.length * SEGMENT_STRIDE);
    order.forEach((i, n) => {
      sorted.set([list[i], list[i + 1], list[i + 2], list[i + 3], bound[i / 4]], n * SEGMENT_STRIDE);
    });
    segmentArrays.set(k, sorted);
  }
  const landArrays = new Map<number, Float64Array>();
  for (const [k, list] of landNear) landArrays.set(k, Float64Array.from(list));

  const sampleCoastDistance = (x: number, z: number): number => {
    const k = worldToHexKey(x, z);
    const segments = segmentArrays.get(k);
    let distSq = MAX_COAST_DISTANCE * MAX_COAST_DISTANCE;
    if (segments) {
      for (let i = 0; i < segments.length; i += SEGMENT_STRIDE) {
        const lowerBound = segments[i + 4];
        if (lowerBound > 0 && lowerBound * lowerBound >= distSq) break;
        const d = pointSegmentDistanceSq(x, z, segments[i], segments[i + 1], segments[i + 2], segments[i + 3]);
        if (d < distSq) distSq = d;
      }
    }
    const dist = Math.sqrt(distSq);
    const signed = landElevation.has(k) ? dist : -dist;
    if (coastNoiseAmplitude === 0) return signed;
    return signed + coastNoiseAmplitude * fbm2(coastNoise, x, z, COAST_NOISE_FREQUENCY);
  };

  /** Kernel-weighted blend of nearby land cells: [targetHeight, elevation], or null if none in reach. */
  const blendLand = (x: number, z: number, out: [number, number]): boolean => {
    const land = landArrays.get(worldToHexKey(x, z));
    if (!land) return false;
    let wSum = 0;
    let hSum = 0;
    let eSum = 0;
    const r2 = BLEND_RADIUS * BLEND_RADIUS;
    for (let i = 0; i < land.length; i += 4) {
      const dx = x - land[i];
      const dz = z - land[i + 1];
      const t = 1 - (dx * dx + dz * dz) / r2;
      if (t <= 0) continue;
      const w = t * t;
      wSum += w;
      hSum += w * land[i + 2];
      eSum += w * land[i + 3];
    }
    if (wSum === 0) return false;
    out[0] = hSum / wSum;
    out[1] = eSum / wSum;
    return true;
  };

  const scratch: [number, number] = [0, 0];

  const sampleHeight = (x: number, z: number): number => {
    const d = sampleCoastDistance(x, z);
    if (d <= 0) {
      // Depths in metres, as the profile is.
      const shelf = -seabedDepth(unitsToMetres(-d));
      const rise = reefRise(x, z);
      if (rise === 0) return SEA_LEVEL + metresToUnits(shelf);
      const crest = -(REEF_CREST_DEPTH + REEF_CREST_VARIATION * fbm2(reefNoise, x, z, REEF_CREST_FREQUENCY));
      // Polynomial smooth max, so a crest meeting an already shallow shelf leaves no crease.
      const h = Math.max(REEF_BLEND - Math.abs(shelf - crest), 0) / REEF_BLEND;
      const top = Math.max(shelf, crest) + (h * h * REEF_BLEND) / 4;
      return SEA_LEVEL + metresToUnits(shelf + (top - shelf) * rise);
    }
    const blended = blendLand(x, z, scratch);
    const target = blended ? scratch[0] : ELEVATION_HEIGHTS[1];
    const elevation = blended ? scratch[1] : 1;
    // Soft toe on beaches (#38): d²/(d + toe) leaves the waterline with zero
    // slope and becomes d − toe inland, so a beach meets the water
    // tangentially instead of rising at 34° from it. It fades out from beach
    // (elevation 1) to jungle (2): rocky coasts still meet the sea steeply.
    const toe = SHORE_TOE * Math.max(0, Math.min(1, 2 - elevation));
    const inland = toe > 0 ? (d * d) / (d + toe) : d;
    const t = 1 - Math.min(inland / SHORE_RAMP, 1);
    const ramp = 1 - t * t;
    if (reliefScale === 0) return SEA_LEVEL + target * ramp;
    const relief = reliefScale * reliefAmplitude(elevation) * reliefShape(reliefNoise, x, z, elevation);
    // Relief is scaled by the original ramp squared (no toe): it already
    // vanishes with zero slope at the shore.
    const tr = 1 - Math.min(d / SHORE_RAMP, 1);
    const reliefRamp = 1 - tr * tr;
    return SEA_LEVEL + target * ramp + relief * reliefRamp * reliefRamp;
  };

  const sampleElevation = (x: number, z: number): number => {
    const out: [number, number] = [0, 0];
    return blendLand(x, z, out) ? out[1] : 0;
  };

  const isNearLand = (x: number, z: number): boolean => landArrays.has(worldToHexKey(x, z));
  const isNearSeabed = (x: number, z: number): boolean => nearSeabed.has(worldToHexKey(x, z));

  return {
    sampleHeight: (x, z) => sampleHeight(inStrip(x), z),
    sampleCoastDistance: (x, z) => sampleCoastDistance(inStrip(x), z),
    sampleElevation: (x, z) => sampleElevation(inStrip(x), z),
    isNearLand: (x, z) => isNearLand(inStrip(x), z),
    isNearSeabed: (x, z) => isNearSeabed(inStrip(x), z),
    bounds,
    periodX: strip ? strip.width : null,
  };
}
