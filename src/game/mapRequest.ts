import { createWrap } from "./hex";
import { generateWorld } from "./mapGenerator";
import type { MapWorld } from "./mapGenerator";
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
export interface GeneratedMap extends MapRequest, MapWorld {}

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
 * The map for `request`, its cells and regions (#239): the size's preset as a
 * rectangle that wraps east–west, a cylinder as wide as its columns (#36),
 * generated from the seed. Pure and deterministic, so the map worker and the
 * main thread agree.
 */
export function generateMapFor({ mapSize, mapSeed }: MapRequest): MapWorld {
  const preset = getMapPreset(mapSize);
  return generateWorld(preset, mapSeed, createWrap(preset.columns));
}
