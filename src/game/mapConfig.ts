export type MapSizeId = "small" | "medium" | "large";

/**
 * Size of a rectangular map: flat-top hexes in `columns` vertical columns
 * (canonical q in [0, columns)), each `rows` hexes tall in odd-q offset rows
 * (see `hexRect` in hex.ts). `columns` is even so the map can wrap east–west.
 */
export interface MapDimensions {
  columns: number;
  rows: number;
}

export interface MapPreset extends MapDimensions {
  id: MapSizeId;
  label: string;
}

/** About the hex counts of the old hexagonal maps of radius 12, 18 and 25. */
export const MAP_PRESETS: readonly MapPreset[] = [
  { id: "small", label: "Small", columns: 24, rows: 18 },
  { id: "medium", label: "Medium", columns: 36, rows: 28 },
  { id: "large", label: "Large", columns: 50, rows: 38 },
] as const;

export const DEFAULT_MAP_SIZE: MapSizeId = "small";

export function getMapPreset(size: MapSizeId): MapPreset {
  return MAP_PRESETS.find((p) => p.id === size)!;
}

const SQRT3 = Math.sqrt(3);

/** World XZ extent of the cell centres of a `columns × rows` map. */
export interface MapWorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * World XZ extent of the map's cell centres. Columns are 1.5 units apart in x;
 * rows are √3 apart in z, and odd columns sit half a row lower.
 */
export function mapWorldBounds({ columns, rows }: MapDimensions): MapWorldBounds {
  return {
    minX: 0,
    maxX: 1.5 * (columns - 1),
    minZ: 0,
    maxZ: SQRT3 * (rows - 1 + (columns > 1 ? 0.5 : 0)),
  };
}

export interface CameraConfig {
  height: number;
  offset: number;
  minDistance: number;
  maxDistance: number;
  // Orthographic camera settings
  frustumSize: number;
  /** Camera-to-target distance of the first view. */
  isoDistance: number;
  /** Closest camera-to-target distance the zoom allows. */
  zoomFloor: number;
  /** World point the camera looks at to start with: the centre of the map. */
  target: [number, number, number];
}

/**
 * Derive camera parameters from the map size, scaled by the map's larger world
 * span: 1.5 units per column across, √3 per row down (one hex pitch each way).
 */
export function computeCameraConfig(dimensions: MapDimensions): CameraConfig {
  const worldSpan = Math.max(1.5 * dimensions.columns, SQRT3 * dimensions.rows);

  const height = worldSpan * 0.9;
  const offset = worldSpan * 0.52;
  const minDistance = worldSpan * 0.4;
  const maxDistance = worldSpan * 1.8;

  // Orthographic frustum size (half-height of view)
  const frustumSize = worldSpan * 0.6;
  // Camera-to-target distance to start at (the board places the camera
  // along its fixed unit direction from the target; see cameraBounds.ts).
  // 0.66 keeps the old view: it was configured as 0.8 but placed along a
  // vector of length √0.68 ≈ 0.8246 (#78).
  const isoDistance = worldSpan * 0.66;
  // Closest the camera may zoom in (MapControls minDistance), the old
  // `isoDistance × 0.15`, which MapControls always took as a real distance.
  const zoomFloor = worldSpan * 0.12;

  const bounds = mapWorldBounds(dimensions);
  const target: [number, number, number] = [
    (bounds.minX + bounds.maxX) / 2,
    0,
    (bounds.minZ + bounds.maxZ) / 2,
  ];

  return { height, offset, minDistance, maxDistance, frustumSize, isoDistance, zoomFloor, target };
}
