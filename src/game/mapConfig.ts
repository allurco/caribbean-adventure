import { hexToWorld } from "./hex";

export type MapSizeId = "small" | "medium" | "large";

export interface MapPreset {
  id: MapSizeId;
  label: string;
  radius: number;
}

export const MAP_PRESETS: readonly MapPreset[] = [
  { id: "small", label: "Small", radius: 5 },
  { id: "medium", label: "Medium", radius: 8 },
  { id: "large", label: "Large", radius: 12 },
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

  return { height, offset, minDistance, maxDistance };
}
