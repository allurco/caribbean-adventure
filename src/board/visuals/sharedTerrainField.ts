import type { MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import {
  createTerrainHeightField,
  terrainSeedFromCells,
  type TerrainHeightField,
} from "./terrainHeightField";

const fieldsByCells = new WeakMap<readonly MapCell[], { wrap: MapWrap; field: TerrainHeightField }>();

const sameWrap = (a: MapWrap, b: MapWrap): boolean => (a?.columns ?? null) === (b?.columns ?? null);

/**
 * The map's one terrain height field, built once per `cells` array (and wrap)
 * and shared by every visual consumer (land mesh, ocean, decorations, port
 * markers). With a wrap it repeats every wrap width (#36).
 */
export function sharedTerrainField(cells: readonly MapCell[], wrap: MapWrap): TerrainHeightField {
  const cached = fieldsByCells.get(cells);
  if (cached && sameWrap(cached.wrap, wrap)) return cached.field;
  const field = createTerrainHeightField(cells, terrainSeedFromCells(cells), { wrap });
  fieldsByCells.set(cells, { wrap, field });
  return field;
}
