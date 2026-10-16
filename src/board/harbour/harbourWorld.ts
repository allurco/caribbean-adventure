import { createWrap, type MapWrap } from "../../game/hex";
import { getMapPreset } from "../../game/mapConfig";
import type { MapCell } from "../../game/types";
import type { GeneratedMap } from "../../game/mapRequest";
import { createMapWorkerRunner } from "../../mapWorker/createMapWorkerRunner";
import { generateMapOffThread } from "../../mapWorker/generateMapOffThread";
import { decorationLayoutOf } from "../visuals/decorationLayout";
import { sharedTerrainField } from "../visuals/sharedTerrainField";
import { landMeshOf } from "../visuals/useLandTerrain";
import { bakedFieldOf } from "../visuals/useTerrainFieldTexture";
import { createHeldOnce } from "./heldOnce";
import { HARBOUR_MAP, harbourTarget, type Vec3 } from "./harbourView";

/** The harbour backdrop's world: its map, the seed every seeded visual draws from (ADR 0007), and where the camera looks. */
export interface HarbourWorld {
  cells: MapCell[];
  wrap: MapWrap;
  seed: number;
  target: Vec3;
}

/** The per-map builds the scene reads (the terrain field, its bake, the land mesh, the decorations), cached per map (perMapCache). */
export type HarbourWorldBuild = (cells: MapCell[], wrap: MapWrap, seed: number) => unknown;

/** How the world is built: the map, then each per-map build with the page let in before it. */
export interface HarbourWorldSteps {
  generateMap: () => Promise<GeneratedMap>;
  builds: readonly HarbourWorldBuild[];
  yieldToPage: () => Promise<void>;
}

const HARBOUR_WORLD_STEPS: HarbourWorldSteps = {
  generateMap: () => generateMapOffThread(HARBOUR_MAP, createMapWorkerRunner()),
  builds: [sharedTerrainField, bakedFieldOf, landMeshOf, decorationLayoutOf],
  yieldToPage,
};

/**
 * The harbour's world, the same on every load (#122): the map generated in
 * the map worker (#124), then the per-map builds the scene reads, each in a
 * task of its own with the page let in between, so the shell answers input
 * while the harbour is built. They are cached per map (perMapCache), so the
 * scene's hooks then find them built.
 */
export async function buildHarbourWorld(steps: HarbourWorldSteps): Promise<HarbourWorld> {
  const map = await steps.generateMap();
  const world: HarbourWorld = {
    cells: map.cells,
    wrap: createWrap(getMapPreset(map.mapSize).columns),
    seed: map.mapSeed,
    target: harbourTarget(map.cells),
  };
  const { cells, wrap, seed } = world;
  for (const build of steps.builds) {
    await steps.yieldToPage();
    build(cells, wrap, seed);
  }
  return world;
}

const harbourWorld = createHeldOnce(() => buildHarbourWorld(HARBOUR_WORLD_STEPS));

/** The harbour's world, built once and shared until the scene lets it go (holdHarbourWorld). */
export const harbourWorldOnce = harbourWorld.once;

/**
 * Keeps the world while the scene is mounted; the release lets it go, so its
 * map and every per-map cache keyed on it can be collected once the shell is
 * left (the board then builds its own world). Call it from an effect.
 */
export const holdHarbourWorld = harbourWorld.hold;

/** Ends the task, so input and rendering waiting on the page run before the next build. */
function yieldToPage(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
