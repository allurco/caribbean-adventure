/**
 * The one rule the village, the port kit and the town's clutter keep to on
 * a port's town cells (#170). Pure, no Three.js.
 *
 * A footprint (a disc of `reach`) stands only wholly on the town's cells;
 * and on a cell the town spilled onto it stands only above the shore band
 * (`SHORE_KEEP_TOP`), so the spill never takes a neighbour's beach and the
 * coast there (and any docking hex it faces) stays clear; only the port's
 * own waterfront is built on.
 */
import { townCellsBound, type TownCells } from "./townCells";
import { SHORE_KEEP_TOP } from "./townPlateau";

/** Why the town's cells refuse a footprint, if they do. */
export type TownCellsRefusal = "outside town" | "shore band";

/** The rule for one town: `lowest` is the lowest ground under the footprint. */
export type TownCellsRule = (x: number, z: number, reach: number, lowest: number) => TownCellsRefusal | undefined;

export function townCellsRule(town: TownCells): TownCellsRule {
  const inTown = townCellsBound(town);
  const inPortCell = townCellsBound({ portId: town.portId, cells: town.cells.slice(0, 1) });
  return (x, z, reach, lowest) => {
    if (!inTown.contains(x, z, reach)) return "outside town";
    if (lowest < SHORE_KEEP_TOP && !inPortCell.contains(x, z, reach)) return "shore band";
    return undefined;
  };
}
