import type { MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import {
  createTerrainHeightField,
  terrainSeedFromCells,
  type TerrainHeightField,
  type TerrainHeightFieldOptions,
} from "./terrainHeightField";

const fieldsByCells = new WeakMap<readonly MapCell[], { wrap: MapWrap; field: TerrainHeightField }>();

const sameWrap = (a: MapWrap, b: MapWrap): boolean => (a?.columns ?? null) === (b?.columns ?? null);

/** Dev-only field options (#83 prototype), set once from the URL before any field is built. */
let devOptions: Pick<TerrainHeightFieldOptions, "massifs"> = {};

/** Set the dev-only options every shared field is built with (call before the first build). */
export function setSharedTerrainFieldOptions(options: Pick<TerrainHeightFieldOptions, "massifs">): void {
  devOptions = options;
}

/**
 * The map's one terrain height field, built once per `cells` array (and wrap)
 * and shared by every visual consumer (land mesh, ocean, decorations, port
 * markers). With a wrap it repeats every wrap width (#36).
 */
export function sharedTerrainField(cells: readonly MapCell[], wrap: MapWrap): TerrainHeightField {
  const cached = fieldsByCells.get(cells);
  if (cached && sameWrap(cached.wrap, wrap)) return cached.field;
  const field = createTerrainHeightField(cells, terrainSeedFromCells(cells), { wrap, ...devOptions });
  fieldsByCells.set(cells, { wrap, field });
  return field;
}
