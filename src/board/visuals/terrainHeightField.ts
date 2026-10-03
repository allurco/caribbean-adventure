/**
 * The one terrain height field (ADR 0001).
 *
 * A pure function of the map cells and a seed that every visual consumer
 * samples. No Three.js here so it stays unit-testable; GPU consumers bake a
 * texture from `sampleHeight`, CPU consumers call it directly.
 *
 *   height(p) = coast(d) where d = signed distance to the land/water hex
 *               boundary (+ on land, − on water) plus simplex noise.
 *   d ≤ 0  → seabed, sloping down to −MAX_DEPTH.
 *   d > 0  → blendedTarget(p) · ramp(d), where blendedTarget is a smooth
 *            kernel-weighted average of nearby land cells' elevation heights.
 *
 * Both branches are 0 at d = 0, so the coast sits at sea level, and land hex
 * edges are never boundary edges, so adjacent land hexes never dip.
 */
import { createNoise2D, type NoiseFunction2D } from "simplex-noise";
import type { MapCell } from "../../game/types";
import { hexToWorld } from "../../game/hex";

/** World height that each land elevation rises to (1 beach, 2 jungle, 3 mountain). */
export const ELEVATION_HEIGHTS = { 1: 0.3, 2: 0.75, 3: 1.4 } as const;

/** Sea level in world Y. */
export const SEA_LEVEL = 0;

/** Max shoreline displacement from the hex edge, in world units. Must stay below the hex inradius (√3/2). */
export const COAST_NOISE_AMPLITUDE = 0.25;
const COAST_NOISE_FREQUENCY = 1.3;

/** Distance inland over which land rises from sea level to its target height. */
const SHORE_RAMP = 0.9;
/** Seabed depth far from shore, and its slope at the shoreline. */
const MAX_DEPTH = 1.0;
const SEABED_SLOPE = 0.6;
/** Coast distance is clamped to this; beyond it the field is flat. */
const MAX_COAST_DISTANCE = 2;
/**
 * Elevation blend kernel radius. 2 reaches adjacent centres (√3 apart) with a
 * small weight and never reaches ring-2 centres from inside a hex, so the
 * blend only needs a hex and its 6 neighbours.
 */
const BLEND_RADIUS = 2;
/** Gentle surface relief on land, scaled by the shore ramp. */
const LAND_NOISE_AMPLITUDE = 0.04;
const LAND_NOISE_FREQUENCY = 0.9;

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
}

export interface TerrainHeightField {
  /** Terrain height (world Y) at world (x, z). ~0 at the coast, negative over water. */
  sampleHeight: (x: number, z: number) => number;
  /** Noise-perturbed signed distance to the coast: positive on land, negative over water, clamped to ±2. */
  sampleCoastDistance: (x: number, z: number) => number;
  /** Blended land elevation (1 beach … 3 mountain) at (x, z); 0 where no land cell is near. */
  sampleElevation: (x: number, z: number) => number;
  /** World-space XZ extent of the map cells, padded by one hex. */
  bounds: TerrainBounds;
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

function pointSegmentDistance(
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
  return Math.sqrt(dx * dx + dz * dz);
}

function elevationHeight(elevation: number): number {
  if (elevation >= 3) return ELEVATION_HEIGHTS[3];
  if (elevation === 2) return ELEVATION_HEIGHTS[2];
  return ELEVATION_HEIGHTS[1];
}

/** Two-octave simplex noise in [-1, 1]. */
function fbm2(noise: NoiseFunction2D, x: number, z: number): number {
  return 0.67 * noise(x, z) + 0.33 * noise(x * 2.1 + 17.3, z * 2.1 - 5.7);
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
  const coastNoise = createNoise2D(rng);
  const landNoise = createNoise2D(rng);

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
    if (cell.terrain === "island") {
      landElevation.set(hexKey(cell.hex.q, cell.hex.r), Math.max(1, Math.min(3, cell.elevation)));
    }
  }
  if (!Number.isFinite(minX)) {
    minX = maxX = minZ = maxZ = 0;
  }
  const bounds: TerrainBounds = { minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 };

  // Coastline segments (shared edge of a land hex and a non-land neighbour),
  // indexed by every hex within 2 of either side. A point inside hex H is
  // within MAX_COAST_DISTANCE (2) only of edges of hexes within 2 of H, so the
  // per-hex lists make the clamped distance exact.
  const segmentsNear = new Map<number, number[]>();
  // Land centres (x, z, targetHeight, elevation) for each hex and its neighbours.
  const landNear = new Map<number, number[]>();

  for (const cell of cells) {
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
      const addTo = (hq: number, hr: number) => {
        const k = hexKey(hq, hr);
        let list = segmentsNear.get(k);
        if (!list) segmentsNear.set(k, (list = []));
        list.push(...segment);
      };
      // Index by hexes within 2 of the land side and of the water side;
      // a hex near both just checks the segment twice, which is harmless.
      const seen = new Set<number>();
      const addOnce = (hq: number, hr: number) => {
        const k = hexKey(hq, hr);
        if (seen.has(k)) return;
        seen.add(k);
        addTo(hq, hr);
      };
      forEachHexWithin(q, r, 2, addOnce);
      forEachHexWithin(nq, nr, 2, addOnce);
    }
  }

  const segmentArrays = new Map<number, Float64Array>();
  for (const [k, list] of segmentsNear) segmentArrays.set(k, Float64Array.from(list));
  const landArrays = new Map<number, Float64Array>();
  for (const [k, list] of landNear) landArrays.set(k, Float64Array.from(list));

  const sampleCoastDistance = (x: number, z: number): number => {
    const k = worldToHexKey(x, z);
    const segments = segmentArrays.get(k);
    let dist = MAX_COAST_DISTANCE;
    if (segments) {
      for (let i = 0; i < segments.length; i += 4) {
        const d = pointSegmentDistance(x, z, segments[i], segments[i + 1], segments[i + 2], segments[i + 3]);
        if (d < dist) dist = d;
      }
    }
    const signed = landElevation.has(k) ? dist : -dist;
    if (coastNoiseAmplitude === 0) return signed;
    return signed + coastNoiseAmplitude * fbm2(coastNoise, x * COAST_NOISE_FREQUENCY, z * COAST_NOISE_FREQUENCY);
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
      return SEA_LEVEL - MAX_DEPTH * Math.tanh((-d * SEABED_SLOPE) / MAX_DEPTH);
    }
    const target = blendLand(x, z, scratch) ? scratch[0] : ELEVATION_HEIGHTS[1];
    const t = 1 - Math.min(d / SHORE_RAMP, 1);
    const ramp = 1 - t * t;
    const relief = LAND_NOISE_AMPLITUDE * landNoise(x * LAND_NOISE_FREQUENCY, z * LAND_NOISE_FREQUENCY);
    // Relief is scaled by ramp² so it vanishes (with zero slope) at the shore.
    return SEA_LEVEL + target * ramp + relief * ramp * ramp;
  };

  const sampleElevation = (x: number, z: number): number => {
    const out: [number, number] = [0, 0];
    return blendLand(x, z, out) ? out[1] : 0;
  };

  return { sampleHeight, sampleCoastDistance, sampleElevation, bounds };
}
