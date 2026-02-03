import type { Hex } from "./hex";
import { neighbors, hexEquals } from "./hex";
import type { MapCell } from "./mapGenerator";

export const validMoveTargets = (
  shipPosition: Hex,
  cells: MapCell[],
  occupied: Hex[] = [],
): Hex[] =>
  neighbors(shipPosition).filter(
    (n) =>
      cells.some(
        (cell) =>
          hexEquals(cell.hex, n) && (cell.terrain === "water" || cell.hasPort),
      ) && !occupied.some((o) => hexEquals(o, n)),
  );
