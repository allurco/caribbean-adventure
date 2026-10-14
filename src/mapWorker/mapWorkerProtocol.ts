import { generateMapFor } from "../game/mapRequest";
import type { MapRequest } from "../game/mapRequest";
import type { MapWorld } from "../game/mapGenerator";

/** What the main thread posts to the map worker: the map to generate. */
export interface MapWorkerRequest {
  request: MapRequest;
}

/** What the map worker posts back: the map (cells and regions), or why it could not make it. */
export type MapWorkerResponse = { ok: true; world: MapWorld } | { ok: false; error: string };

/**
 * The worker's whole job (#124): generate the requested map with the same
 * pure generator the main thread uses, and never throw, so a failure comes
 * back as an answer the main thread can fall back on.
 */
export function answerMapWorkerRequest({ request }: MapWorkerRequest): MapWorkerResponse {
  try {
    return { ok: true, world: generateMapFor(request) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The map in a message from the map worker, or undefined if it failed or is not an answer at all. */
export function readMapWorkerResponse(data: unknown): MapWorld | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const response = data as Partial<{ ok: unknown; world: unknown }>;
  if (response.ok !== true || typeof response.world !== "object" || response.world === null) return undefined;
  const world = response.world as Partial<{ cells: unknown; regions: unknown }>;
  return Array.isArray(world.cells) && Array.isArray(world.regions) ? (response.world as MapWorld) : undefined;
}
