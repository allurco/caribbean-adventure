/**
 * Islands and the stable ids seeded visuals key off (ADR 0007). Pure, board-side.
 *
 * Nothing here is stored in `G`: islands are re-derived from `G.cells`.
 * - `cellId`: a hex's canonical key, `"q,r"` of its copy in the canonical columns.
 * - `portId`: the port cell's `cellId`.
 * - `islandId`: the `cellId` of the island's lowest cell (least `q`, then least `r`,
 *   in canonical coordinates).
 *
 * An island is a connected component of land (`terrain === "island"`) cells,
 * joined across the east–west seam when the map wraps. None of the ids depends
 * on the order of `G.cells` or on which world copy a cell was given in, so a
 * feature keyed by them (`subSeed(G.mapSeed, feature, islandId)`) is the same on
 * every client, reload and world copy.
 */
import { canonicalHex, wrappedNeighbors } from "../../game/hex";
import type { Hex, MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/mapGenerator";

export type CellId = string;
export type PortId = CellId;
export type IslandId = CellId;

export interface Island {
  /** The `cellId` of the island's lowest cell. */
  readonly id: IslandId;
  /** The island's cells in canonical coordinates, lowest first (by `q`, then `r`). */
  readonly cells: readonly Hex[];
}

/** A hex's canonical key: the same string for every world copy of the hex. */
export function cellId(h: Hex, wrap: MapWrap): CellId {
  const c = canonicalHex(h, wrap);
  return `${c.q + 0},${c.r + 0}`;
}

/**
 * The `cellId` of a cell of `G.cells`, which `G` keeps canonical
 * (`CaribbeanState.wrap`): its `"q,r"` key as given, so a per-map layout that
 * walks `G.cells` keys its sub-seeds without needing the wrap. A port's
 * cell gives its `portId`.
 */
export const mapCellId = (cell: Pick<MapCell, "hex">): CellId => cellId(cell.hex, null);

/** Orders canonical hexes by `q`, then `r`. */
const byLowest = (a: Hex, b: Hex): number => a.q - b.q || a.r - b.r;

/** Every land cell's island, each listed once, ordered by their lowest cells. */
export function findIslands(cells: readonly MapCell[], wrap: MapWrap): Island[] {
  const land = new Map<CellId, Hex>();
  for (const cell of cells) {
    if (cell.terrain === "island") land.set(cellId(cell.hex, wrap), canonicalHex(cell.hex, wrap));
  }

  const visited = new Set<CellId>();
  const islands: Island[] = [];
  for (const [startId, start] of land) {
    if (visited.has(startId)) continue;
    visited.add(startId);
    const members: Hex[] = [];
    const queue: Hex[] = [start];
    while (queue.length > 0) {
      const h = queue.pop()!;
      members.push(h);
      for (const n of wrappedNeighbors(h, wrap)) {
        const id = cellId(n, wrap);
        const neighbour = land.get(id);
        if (neighbour && !visited.has(id)) {
          visited.add(id);
          queue.push(neighbour);
        }
      }
    }
    members.sort(byLowest);
    islands.push({ id: cellId(members[0], wrap), cells: members });
  }
  return islands.sort((a, b) => byLowest(a.cells[0], b.cells[0]));
}

/** Each land cell's island id, by `cellId`. */
export function islandIdsByCell(islands: readonly Island[], wrap: MapWrap): Map<CellId, IslandId> {
  const byCell = new Map<CellId, IslandId>();
  for (const island of islands) {
    for (const h of island.cells) byCell.set(cellId(h, wrap), island.id);
  }
  return byCell;
}

/** Every port's id, ordered by its cell (by `q`, then `r`). */
export function portIds(cells: readonly MapCell[], wrap: MapWrap): PortId[] {
  return cells
    .filter((c) => c.hasPort)
    .map((c) => canonicalHex(c.hex, wrap))
    .sort(byLowest)
    .map((h) => cellId(h, wrap));
}
