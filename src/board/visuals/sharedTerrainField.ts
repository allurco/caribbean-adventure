import type { MapCell } from "../../game/types";
import {
  createTerrainHeightField,
  terrainSeedFromCells,
  type TerrainHeightField,
} from "./terrainHeightField";

const fieldsByCells = new WeakMap<readonly MapCell[], TerrainHeightField>();

/**
 * The map's one terrain height field, built once per `cells` array and shared
 * by every visual consumer (land mesh, ocean, decorations, port markers).
 */
export function sharedTerrainField(cells: readonly MapCell[]): TerrainHeightField {
  let field = fieldsByCells.get(cells);
  if (!field) {
    field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    fieldsByCells.set(cells, field);
  }
  return field;
}
