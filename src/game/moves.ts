import type { Hex } from "./hex";
import { neighbors, hexEquals } from "./hex";
import type { MapCell } from "./mapGenerator";

/** Find the port cell that a ship can access from their current position (docking hex) */
export const findAccessiblePort = (
  shipPosition: Hex,
  cells: MapCell[]
): MapCell | undefined =>
  cells.find(
    (c) => c.hasPort && c.dockingHex && hexEquals(c.dockingHex, shipPosition)
  );

export const validMoveTargets = (
  shipPosition: Hex,
  cells: MapCell[],
  occupied: Hex[] = [],
  shallowDraft: boolean = true,
): Hex[] =>
  neighbors(shipPosition).filter((n) => {
    const cell = cells.find((c) => hexEquals(c.hex, n));
    if (!cell) return false;

    // Cannot move to occupied hexes
    if (occupied.some((o) => hexEquals(o, n))) return false;

    // Water is always passable (including port docking areas)
    if (cell.terrain === "water") return true;

    // Reefs only passable by shallow-draft ships
    if (cell.terrain === "reef") return shallowDraft;

    // Islands are never passable (ships dock at water hex adjacent to port)
    return false;
  });
