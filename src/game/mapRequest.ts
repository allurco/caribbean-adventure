import { createWrap } from "./hex";
import { generateMap } from "./mapGenerator";
import type { MapCell } from "./mapGenerator";
import { getMapPreset } from "./mapConfig";
import type { MapSizeId } from "./mapConfig";
import { isValidMapSeed } from "./mapSeed";
import type { CaribbeanSetupData } from "./types";

/** Everything that decides a generated map: the same request always yields the same cells. */
export interface MapRequest {
  mapSize: MapSizeId;
  mapSeed: number;
}

/** A map generated ahead of `setup()` (off the main thread, #124), with what it was generated from. */
export interface GeneratedMap extends MapRequest {
  cells: MapCell[];
}

const MAP_SIZES: readonly MapSizeId[] = ["small", "medium", "large"];

/**
 * The map that `setupData` asks for: its size, else one drawn from `random`;
 * its seed if it names exactly one map (#82), else one drawn from `random`
 * after the size. `random` returns numbers in [0, 1), like boardgame.io's
 * `random.Number` or `Math.random`.
 */
export function resolveMapRequest(setupData: CaribbeanSetupData | undefined, random: () => number): MapRequest {
  const mapSize: MapSizeId = setupData?.mapSize ?? MAP_SIZES[Math.floor(random() * MAP_SIZES.length)];
  // A server's setupData arrives unchecked, so the seed is checked here.
  const requestedSeed: unknown = setupData?.mapSeed;
  const mapSeed = isValidMapSeed(requestedSeed) ? requestedSeed : Math.floor(random() * 1000000);
  return { mapSize, mapSeed };
}

/**
 * The cells for `request`: the size's preset as a rectangle that wraps
 * east–west, a cylinder as wide as its columns (#36), generated from the seed.
 * Pure and deterministic, so the map worker and the main thread agree.
 */
export function generateMapFor({ mapSize, mapSeed }: MapRequest): MapCell[] {
  const preset = getMapPreset(mapSize);
  return generateMap(preset, mapSeed, createWrap(preset.columns));
}
