import type { Hex, MapWrap } from "./hex";
import { wrappedNeighbors, wrappedEquals } from "./hex";
import type { MapCell } from "./mapGenerator";

/** Find the port cell that a ship can access from their current position (docking hex) */
export const findAccessiblePort = (
  shipPosition: Hex,
  cells: MapCell[],
  wrap: MapWrap,
): MapCell | undefined =>
  cells.find(
    (c) => c.hasPort && c.dockingHex && wrappedEquals(c.dockingHex, shipPosition, wrap)
  );

export const validMoveTargets = (
  shipPosition: Hex,
  cells: MapCell[],
  wrap: MapWrap,
  occupied: Hex[] = [],
  shallowDraft: boolean = true,
): Hex[] =>
  wrappedNeighbors(shipPosition, wrap).filter((n) => {
    const cell = cells.find((c) => wrappedEquals(c.hex, n, wrap));
    if (!cell) return false;

    // Cannot move to occupied hexes
    if (occupied.some((o) => wrappedEquals(o, n, wrap))) return false;

    // Water is always passable (including port docking areas)
    if (cell.terrain === "water") return true;

    // Reefs only passable by shallow-draft ships
    if (cell.terrain === "reef") return shallowDraft;

    // Islands are never passable (ships dock at water hex adjacent to port)
    return false;
  });
