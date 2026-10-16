import { createWrap, type MapWrap } from "../../game/hex";
import { getMapPreset } from "../../game/mapConfig";
import type { MapCell } from "../../game/types";
import { createMapWorkerRunner } from "../../mapWorker/createMapWorkerRunner";
import { generateMapOffThread } from "../../mapWorker/generateMapOffThread";
import { decorationLayoutOf } from "../visuals/decorationLayout";
import { sharedTerrainField } from "../visuals/sharedTerrainField";
import { landMeshOf } from "../visuals/useLandTerrain";
import { bakedFieldOf } from "../visuals/useTerrainFieldTexture";
import { HARBOUR_MAP, harbourTarget, type Vec3 } from "./harbourView";

/** The harbour backdrop's world: its map, the seed every seeded visual draws from (ADR 0007), and where the camera looks. */
export interface HarbourWorld {
  cells: MapCell[];
  wrap: MapWrap;
  seed: number;
  target: Vec3;
}

let pending: Promise<HarbourWorld> | undefined;

/**
 * The harbour's world, once per page and the same on every load (#122): the
 * map generated in the map worker (#124), then the per-map builds the scene
 * reads (the terrain field, its bake, the land mesh, the decorations), each
 * in a task of its own with the page let in between, so the shell answers
 * input while the harbour is built. They are cached per map (perMapCache),
 * so the scene's hooks then find them built.
 */
export function harbourWorldOnce(): Promise<HarbourWorld> {
  pending ??= buildHarbourWorld();
  return pending;
}

async function buildHarbourWorld(): Promise<HarbourWorld> {
  const map = await generateMapOffThread(HARBOUR_MAP, createMapWorkerRunner());
  const world: HarbourWorld = {
    cells: map.cells,
    wrap: createWrap(getMapPreset(map.mapSize).columns),
    seed: map.mapSeed,
    target: harbourTarget(map.cells),
  };
  const { cells, wrap, seed } = world;
  for (const build of [sharedTerrainField, bakedFieldOf, landMeshOf, decorationLayoutOf]) {
    await yieldToPage();
    build(cells, wrap, seed);
  }
  return world;
}

/** Ends the task, so input and rendering waiting on the page run before the next build. */
function yieldToPage(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
