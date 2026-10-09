import { generateMapFor } from "../game/mapRequest";
import type { MapRequest } from "../game/mapRequest";
import type { MapCell } from "../game/mapGenerator";

/** What the main thread posts to the map worker: the map to generate. */
export interface MapWorkerRequest {
  request: MapRequest;
}

/** What the map worker posts back: the cells, or why it could not make them. */
export type MapWorkerResponse = { ok: true; cells: MapCell[] } | { ok: false; error: string };

/**
 * The worker's whole job (#124): generate the requested map with the same
 * pure generator the main thread uses, and never throw, so a failure comes
 * back as an answer the main thread can fall back on.
 */
export function answerMapWorkerRequest({ request }: MapWorkerRequest): MapWorkerResponse {
  try {
    return { ok: true, cells: generateMapFor(request) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The cells in a message from the map worker, or undefined if it failed or is not an answer at all. */
export function readMapWorkerResponse(data: unknown): MapCell[] | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const response = data as Partial<{ ok: unknown; cells: unknown }>;
  return response.ok === true && Array.isArray(response.cells) ? (response.cells as MapCell[]) : undefined;
}
