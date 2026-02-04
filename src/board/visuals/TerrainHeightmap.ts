import { DataTexture, RGBAFormat, FloatType, LinearFilter, ClampToEdgeWrapping } from "three";
import { createNoise2D } from "simplex-noise";
import type { MapCell, Elevation } from "../../game/types";
import { hexToWorld } from "../../game/hex";

// Hex geometry constants
const HEX_RADIUS = 1.0;
const SQRT3 = Math.sqrt(3);

// Elevation heights - MUST exceed HexGrid hex tops to fully cover them
// HexGrid positions hexes at ELEVATION_TOP_HEIGHTS + 0.1, so we need extra margin
const ELEVATION_HEIGHT_BOOST: Record<Elevation, number> = {
  0: 0,      // Water - no boost
  1: 0.20,   // Beach - hex top is at ~0.13, need extra margin
  2: 0.45,   // Jungle - hex top is at ~0.30, need extra margin
  3: 0.70,   // Mountain - hex top is at ~0.55, need extra margin
};

export interface HeightmapResult {
  texture: DataTexture;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

// Attempt to match GLSL smoothstep function
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Apply Gaussian blur to heightmap data for smoother terrain edges.
 * Only blurs R (height) and G (biome) channels where terrain exists.
 */
function applyGaussianBlur(
  data: Float32Array,
  resolution: number,
  radius: number
): Float32Array {
  const result = new Float32Array(data.length);

  // Generate Gaussian kernel
  const kernelSize = radius * 2 + 1;
  const kernel: number[] = [];
  const sigma = radius / 2;
  let kernelSum = 0;

  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    const weight = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel.push(weight);
    kernelSum += weight;
  }
  // Normalize kernel
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= kernelSum;
  }

  // Temporary buffer for horizontal pass
  const temp = new Float32Array(data.length);

  // Horizontal pass
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const idx = (y * resolution + x) * 4;

      // Only blur terrain pixels (landMask > 0)
      if (data[idx + 3] < 0.5) {
        temp[idx + 0] = data[idx + 0];
        temp[idx + 1] = data[idx + 1];
        temp[idx + 2] = data[idx + 2];
        temp[idx + 3] = data[idx + 3];
        continue;
      }

      let sumHeight = 0, sumBiome = 0, sumCoast = 0, weightSum = 0;

      for (let k = 0; k < kernelSize; k++) {
        const sx = Math.max(0, Math.min(resolution - 1, x + k - radius));
        const sIdx = (y * resolution + sx) * 4;

        // Only include terrain pixels in blur
        if (data[sIdx + 3] > 0.5) {
          const w = kernel[k];
          sumHeight += data[sIdx + 0] * w;
          sumBiome += data[sIdx + 1] * w;
          sumCoast += data[sIdx + 2] * w;
          weightSum += w;
        }
      }

      if (weightSum > 0) {
        temp[idx + 0] = sumHeight / weightSum;
        temp[idx + 1] = sumBiome / weightSum;
        temp[idx + 2] = sumCoast / weightSum;
      } else {
        temp[idx + 0] = data[idx + 0];
        temp[idx + 1] = data[idx + 1];
        temp[idx + 2] = data[idx + 2];
      }
      temp[idx + 3] = data[idx + 3];
    }
  }

  // Vertical pass
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const idx = (y * resolution + x) * 4;

      if (temp[idx + 3] < 0.5) {
        result[idx + 0] = temp[idx + 0];
        result[idx + 1] = temp[idx + 1];
        result[idx + 2] = temp[idx + 2];
        result[idx + 3] = temp[idx + 3];
        continue;
      }

      let sumHeight = 0, sumBiome = 0, sumCoast = 0, weightSum = 0;

      for (let k = 0; k < kernelSize; k++) {
        const sy = Math.max(0, Math.min(resolution - 1, y + k - radius));
        const sIdx = (sy * resolution + x) * 4;

        if (temp[sIdx + 3] > 0.5) {
          const w = kernel[k];
          sumHeight += temp[sIdx + 0] * w;
          sumBiome += temp[sIdx + 1] * w;
          sumCoast += temp[sIdx + 2] * w;
          weightSum += w;
        }
      }

      if (weightSum > 0) {
        result[idx + 0] = sumHeight / weightSum;
        result[idx + 1] = sumBiome / weightSum;
        result[idx + 2] = sumCoast / weightSum;
      } else {
        result[idx + 0] = temp[idx + 0];
        result[idx + 1] = temp[idx + 1];
        result[idx + 2] = temp[idx + 2];
      }
      result[idx + 3] = temp[idx + 3];
    }
  }

  return result;
}

// Spatial grid for fast nearest-neighbor lookups
// Uses numeric keys to avoid string allocation in hot loops
interface SpatialGrid {
  cellSize: number;
  buckets: Map<number, number[]>;  // grid key -> indices into landCells array
  landPositions: Float64Array;     // flat array: [x0, z0, x1, z1, ...]
  minX: number;
  minZ: number;
  gridWidth: number;
}

function spatialKey(gx: number, gz: number, gridWidth: number): number {
  return (gz + 1000) * gridWidth + (gx + 1000);
}

// Build lookup structure for cells
interface CellLookup {
  cells: MapCell[];
  positions: Map<string, [number, number, number]>;
  grid: Map<string, MapCell>;
  landCells: MapCell[];
  waterCells: MapCell[];
  inlandDepths: Map<string, number>;
  spatialGrid: SpatialGrid;
}

function buildCellLookup(cells: MapCell[]): CellLookup {
  const positions = new Map<string, [number, number, number]>();
  const grid = new Map<string, MapCell>();
  const landCells: MapCell[] = [];
  const waterCells: MapCell[] = [];

  // First pass: categorize cells and compute positions
  for (const cell of cells) {
    const key = `${cell.hex.q},${cell.hex.r}`;
    positions.set(key, hexToWorld(cell.hex));
    grid.set(key, cell);
    if (cell.terrain === "island") {
      landCells.push(cell);
    } else {
      waterCells.push(cell);
    }
  }

  // Build flat position array for land cells (avoids object creation in hot loop)
  const landPositions = new Float64Array(landCells.length * 2);
  let minX = Infinity, minZ = Infinity;
  for (let i = 0; i < landCells.length; i++) {
    const pos = positions.get(`${landCells[i].hex.q},${landCells[i].hex.r}`)!;
    landPositions[i * 2] = pos[0];
    landPositions[i * 2 + 1] = pos[2];
    minX = Math.min(minX, pos[0]);
    minZ = Math.min(minZ, pos[2]);
  }
  if (!isFinite(minX)) minX = 0;
  if (!isFinite(minZ)) minZ = 0;

  // Build spatial grid with numeric keys
  const GRID_SIZE = 3.0;
  const GRID_WIDTH = 3000; // Large enough for any reasonable map
  const buckets = new Map<number, number[]>();

  for (let i = 0; i < landCells.length; i++) {
    const px = landPositions[i * 2];
    const pz = landPositions[i * 2 + 1];
    const gx = Math.floor((px - minX) / GRID_SIZE);
    const gz = Math.floor((pz - minZ) / GRID_SIZE);
    const key = spatialKey(gx, gz, GRID_WIDTH);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(i);
  }

  const spatialGrid: SpatialGrid = {
    cellSize: GRID_SIZE,
    buckets,
    landPositions,
    minX,
    minZ,
    gridWidth: GRID_WIDTH
  };

  // Pre-compute inland depth for each land cell (store as array for fast access)
  const inlandDepths = new Map<string, number>();
  for (let i = 0; i < landCells.length; i++) {
    const landCell = landCells[i];
    const lx = landPositions[i * 2];
    const lz = landPositions[i * 2 + 1];
    let minDist = Infinity;

    for (const waterCell of waterCells) {
      const waterPos = positions.get(`${waterCell.hex.q},${waterCell.hex.r}`)!;
      const dx = lx - waterPos[0];
      const dz = lz - waterPos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) minDist = dist;
    }

    inlandDepths.set(`${landCell.hex.q},${landCell.hex.r}`, minDist);
  }

  return { cells, positions, grid, landCells, waterCells, inlandDepths, spatialGrid };
}

// Terrain constants based on hex spacing (~1.73 units between hex centers)
const HEX_SPACING = 1.73;  // Approximate distance between adjacent hex centers

/**
 * Calculate terrain height based on INLAND DEPTH (distance to water).
 *
 * The 7-hex rule:
 * - Single hex island = flat sand (inland depth ~0)
 * - 2-3 hex cluster = low beach plateau (inland depth ~1 hex)
 * - 7+ hex cluster (3 radius) = can have mountains (inland depth ~3 hexes)
 *
 * Height is determined by how far "inland" a point is, not by stacking cones.
 */
function calculateInlandHeight(
  x: number,
  z: number,
  lookup: CellLookup,
  noise2D: (x: number, y: number) => number
): { height: number; nearestCell: MapCell | null; nearestDist: number; inlandDepth: number } {
  const sg = lookup.spatialGrid;
  const positions = sg.landPositions;

  // Find nearest land cell
  const gx = Math.floor((x - sg.minX) / sg.cellSize);
  const gz = Math.floor((z - sg.minZ) / sg.cellSize);

  let nearestDist = Infinity;
  let nearestIdx = -1;

  const searchRadius = 3;
  for (let dx = -searchRadius; dx <= searchRadius; dx++) {
    for (let dz = -searchRadius; dz <= searchRadius; dz++) {
      const key = spatialKey(gx + dx, gz + dz, sg.gridWidth);
      const bucket = sg.buckets.get(key);
      if (!bucket) continue;

      for (const idx of bucket) {
        const cellX = positions[idx * 2];
        const cellZ = positions[idx * 2 + 1];
        const dist = Math.sqrt((x - cellX) ** 2 + (z - cellZ) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = idx;
        }
      }
    }
  }

  if (nearestIdx < 0) {
    return { height: 0, nearestCell: null, nearestDist: Infinity, inlandDepth: 0 };
  }

  const nearestCell = lookup.landCells[nearestIdx];
  const cellKey = `${nearestCell.hex.q},${nearestCell.hex.r}`;
  const cellInlandDepth = lookup.inlandDepths.get(cellKey) ?? 0;

  // Interpolate inland depth based on position within/around hex
  // At hex center: full inland depth
  // At hex edge (towards water): reduced inland depth
  const hexInfluence = 1.0 - smoothstep(0, HEX_RADIUS * 1.2, nearestDist);
  const effectiveInlandDepth = cellInlandDepth * hexInfluence;

  // Convert inland depth to height allowance
  // 0-1 hex inland = flat beach (max height ~0.1)
  // 1-2 hex inland = low plateau (max height ~0.2)
  // 2-3 hex inland = medium (max height ~0.4)
  // 3+ hex inland = mountains allowed (max height ~0.8+)
  let maxHeight: number;
  const depthInHexes = effectiveInlandDepth / HEX_SPACING;

  if (depthInHexes < 1) {
    // Edge hexes - flat beach
    maxHeight = 0.08 + depthInHexes * 0.05;
  } else if (depthInHexes < 2) {
    // One hex from edge - low plateau
    maxHeight = 0.13 + (depthInHexes - 1) * 0.15;
  } else if (depthInHexes < 3) {
    // Two hexes from edge - medium elevation
    maxHeight = 0.28 + (depthInHexes - 2) * 0.25;
  } else {
    // Three+ hexes from edge - mountains allowed
    maxHeight = 0.53 + Math.min((depthInHexes - 3) * 0.3, 0.5);
  }

  // Add subtle noise variation (not per-hex bumps, just texture)
  const noiseVal = noise2D(x * 0.5, z * 0.5) * 0.03;
  const height = maxHeight + noiseVal;

  return {
    height: Math.max(0.05, height),
    nearestCell,
    nearestDist,
    inlandDepth: effectiveInlandDepth
  };
}

/**
 * Generate heightmap using inland depth to create natural ridges:
 * - Edge hexes (close to water) stay flat/beach
 * - Interior hexes can have mountains
 * - Height scales with distance from water
 */
export function generateHeightmapTexture(
  cells: MapCell[],
  mapRadius: number,
  resolution: number = 512,
  seed: number = 12345
): HeightmapResult {
  // Create seeded noise functions
  // noise2D: used for domain warping (cragginess)
  // noise2D_fine: used for micro-detail (rocky texture)
  const noise2D = createNoise2D(() => {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
  });
  const noise2D_fine = createNoise2D(() => {
    const x = Math.sin((seed + 2) * 9999) * 10000;
    return x - Math.floor(x);
  });

  const lookup = buildCellLookup(cells);

  // Calculate world bounds
  const worldRadius = mapRadius * 1.5 + HEX_RADIUS;
  const verticalRadius = mapRadius * SQRT3 + HEX_RADIUS;
  const padding = HEX_RADIUS * 2;

  const bounds = {
    minX: -worldRadius - padding,
    maxX: worldRadius + padding,
    minZ: -verticalRadius - padding,
    maxZ: verticalRadius + padding,
  };

  const data = new Float32Array(resolution * resolution * 4);

  // Terrain edge constants - keep terrain close to hex boundaries
  const INNER_EDGE = HEX_RADIUS * 0.85;  // Full terrain inside this
  const OUTER_EDGE = HEX_RADIUS * 1.05;  // Terrain ends here (tight to hex edge)

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const worldX = lerp(bounds.minX, bounds.maxX, x / (resolution - 1));
      const worldZ = lerp(bounds.minZ, bounds.maxZ, y / (resolution - 1));
      const idx = (y * resolution + x) * 4;

      // STEP 1: Calculate height based on INLAND DEPTH (7-hex rule)
      const { height, nearestCell, nearestDist, inlandDepth } = calculateInlandHeight(
        worldX, worldZ, lookup, noise2D
      );

      // Skip pixels too far from any land
      if (nearestDist > OUTER_EDGE || !nearestCell) {
        data[idx + 0] = -0.18;
        data[idx + 1] = 0;
        data[idx + 2] = 1;
        data[idx + 3] = 0;
        continue;
      }

      // STEP 2: Calculate smooth landMask for gradual edge fade
      // Tight transition from INNER_EDGE to OUTER_EDGE
      const landMask = 1.0 - smoothstep(INNER_EDGE, OUTER_EDGE, nearestDist);

      // STEP 3: Terrain slopes from -0.18 (underwater) up to full height
      // At edge (landMask=0): -0.18, at center (landMask=1): full height
      const UNDERWATER_START = -0.18;
      const finalHeight = lerp(UNDERWATER_START, Math.max(0.05, height), landMask);

      // STEP 4: BIOME MAPPING based on inland depth
      const depthInHexes = inlandDepth / HEX_SPACING;
      let biome: number;
      if (depthInHexes < 1.5 || finalHeight < 0.15) {
        biome = 0.35;  // Beach/sand
      } else if (depthInHexes < 2.5) {
        biome = 0.55 + (depthInHexes - 1.5) * 0.15;  // Jungle
      } else {
        biome = 0.7 + Math.min((depthInHexes - 2.5) * 0.1, 0.25);  // Dense jungle/mountain
      }

      // coastDist: 0 at water edge, 1 at island center
      const coastDist = smoothstep(0, HEX_SPACING * 2, inlandDepth);

      data[idx + 0] = finalHeight;
      data[idx + 1] = biome;
      data[idx + 2] = coastDist;
      data[idx + 3] = 1;  // Always render terrain within OUTER_EDGE, height handles the fade
    }
  }

  const texture = new DataTexture(data, resolution, resolution, RGBAFormat, FloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return { texture, bounds };
}

/**
 * Compute the map radius from cells
 */
export function computeMapRadius(cells: MapCell[]): number {
  let maxRadius = 0;
  for (const cell of cells) {
    const dist = Math.max(
      Math.abs(cell.hex.q),
      Math.abs(cell.hex.r),
      Math.abs(cell.hex.s)
    );
    if (dist > maxRadius) maxRadius = dist;
  }
  return maxRadius;
}
