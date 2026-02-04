import { hexToWorld } from "./hex";

export type MapSizeId = "small" | "medium" | "large";

export interface MapPreset {
  id: MapSizeId;
  label: string;
  radius: number;
}

export const MAP_PRESETS: readonly MapPreset[] = [
  { id: "small", label: "Small", radius: 12 },
  { id: "medium", label: "Medium", radius: 18 },
  { id: "large", label: "Large", radius: 25 },
] as const;

export const DEFAULT_MAP_SIZE: MapSizeId = "small";

export function getMapPreset(size: MapSizeId): MapPreset {
  return MAP_PRESETS.find((p) => p.id === size)!;
}

export interface CameraConfig {
  height: number;
  offset: number;
  minDistance: number;
  maxDistance: number;
  // Orthographic camera settings
  frustumSize: number;
  isoDistance: number;
}

/**
 * Derive camera parameters from grid radius.
 * Uses the world-space diameter of the hex grid to scale the view.
 */
export function computeCameraConfig(radius: number): CameraConfig {
  // The outermost hex position gives us the world-space extent
  const [edgeX, , edgeZ] = hexToWorld({ q: radius, r: 0, s: -radius });
  const worldDiameter = 2 * Math.max(Math.abs(edgeX), Math.abs(edgeZ));

  const height = worldDiameter * 0.9;
  const offset = worldDiameter * 0.52;
  const minDistance = worldDiameter * 0.4;
  const maxDistance = worldDiameter * 1.8;

  // Orthographic frustum size (half-height of view)
  const frustumSize = worldDiameter * 0.6;
  // Distance for isometric camera position
  const isoDistance = worldDiameter * 0.8;

  return { height, offset, minDistance, maxDistance, frustumSize, isoDistance };
}
