/**
 * A port's town cells (#170, ADR 0006): the cells its village, its port kit
 * and its clutter may stand on. Pure, board-side; nothing is stored in `G`.
 *
 * The town is the port cell and up to `MAX_TOWN_SPILL` of its neighbours,
 * seeded per port from `subSeed(worldSeed, "townSpill", portId)`. A
 * neighbour qualifies (`townSpillCandidates`) when it is
 *
 * - land (so on the port's own island: an adjacent land cell is in the same
 *   connected component) of elevation 2 or less, never a mountain;
 * - not a port cell, and not next to any other port's cell, so no cell is
 *   in two towns and no town reaches another port's cells, whatever order
 *   the ports are laid out in.
 *
 * The town never spills across the shore band: on a spill cell nothing
 * stands on ground under `SHORE_KEEP_TOP` (`villageLayout.ts`,
 * `portSettlement.ts`, `townDetailLayout.ts`), and the plateau leaves the
 * shore band alone everywhere, so the beaches and the coast of the spill
 * cells (and any docking hex they face) stay as they were; only the port's
 * own waterfront is built on.
 *
 * Of the candidates the town takes a seeded count, one to `MAX_TOWN_SPILL`,
 * preferring the ones inland of the pier (where the town plateau runs) with
 * a seeded jitter, so two seeds spread the same port differently. The spill
 * cells are given as plain neighbours of the port's hex (not canonicalised
 * across the wrap seam), so their world positions lie next to the port's in
 * its own world copy.
 */
import { hexToWorld, neighbors, worldToHex, type Hex, type MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { cellId, mapCellId, type PortId } from "./islands";
import { SEED_FEATURES } from "./seedFeatures";
import { stream, subSeed } from "./subSeed";

/** Most neighbours a town spills onto. */
export const MAX_TOWN_SPILL = 3;
/** Highest elevation a spill cell may have (jungle; mountains never). */
export const TOWN_SPILL_MAX_ELEVATION = 2;
/** How much a neighbour straight inland of the pier is preferred over the seeded jitter (which spans 0…1). */
const SPILL_INLAND_WEIGHT = 0.6;
const SQRT3 = Math.sqrt(3);

/** A port's town: its cell first, then the neighbours it spills onto, in the port's world copy. */
export interface TownCells {
  portId: PortId;
  cells: readonly Hex[];
}

const key = (h: Hex) => `${h.q},${h.r}`;

/** The cells of `cells` by their canonical id. */
function cellsById(cells: readonly MapCell[], wrap: MapWrap): Map<string, MapCell> {
  return new Map(cells.map((c) => [cellId(c.hex, wrap), c]));
}

/** The neighbours of a port cell its town may spill onto, in neighbour order. */
export function townSpillCandidates(cells: readonly MapCell[], wrap: MapWrap, port: MapCell, byId = cellsById(cells, wrap)): Hex[] {
  const at = (h: Hex) => byId.get(cellId(h, wrap));
  const portId = cellId(port.hex, wrap);
  return neighbors(port.hex).filter((n) => {
    const cell = at(n);
    if (!cell || cell.terrain !== "island" || cell.hasPort || cell.elevation > TOWN_SPILL_MAX_ELEVATION) return false;
    // Never next to another port's cell.
    return !neighbors(n).some((m) => at(m)?.hasPort && cellId(m, wrap) !== portId);
  });
}

/** Every port's town cells, by port id; `worldSeed` is `G.mapSeed`. */
export function portTownCells(cells: readonly MapCell[], wrap: MapWrap, worldSeed: number): Map<PortId, TownCells> {
  const byId = cellsById(cells, wrap);
  const towns = new Map<PortId, TownCells>();
  for (const port of cells) {
    if (!port.hasPort) continue;
    const portId = mapCellId(port);
    const next = stream(subSeed(worldSeed, SEED_FEATURES.townSpill, portId));
    const count = 1 + Math.min(MAX_TOWN_SPILL - 1, Math.floor(next() * MAX_TOWN_SPILL));
    // One jitter per direction, drawn whether or not it qualifies, so a neighbour's change reshuffles no other.
    const around = neighbors(port.hex);
    const jitter = around.map(() => next());
    const pier = port.decorations?.find((d) => d.type === "pier");
    const toWater = pier?.rotation ?? 0;
    const [px, , pz] = hexToWorld(port.hex);
    const score = (n: Hex) => {
      const [nx, , nz] = hexToWorld(n);
      const inland = (-(nx - px) * Math.sin(toWater) - (nz - pz) * Math.cos(toWater)) / SQRT3;
      return inland * SPILL_INLAND_WEIGHT + jitter[around.findIndex((a) => key(a) === key(n))];
    };
    const candidates = townSpillCandidates(cells, wrap, port, byId);
    const taken = new Set(
      [...candidates]
        .sort((a, b) => score(b) - score(a))
        .slice(0, count)
        .map(key)
    );
    towns.set(portId, { portId, cells: [port.hex, ...around.filter((n) => taken.has(key(n)))] });
  }
  return towns;
}

/** Tests against a town's cells, in its world copy. */
export interface TownCellsBound {
  /**
   * Whether a disc of radius `reach` at (x, z) lies wholly on the town's
   * cells: its centre's cell is one, and it keeps `reach` from every edge
   * that cell shares with a cell outside the town. For a town of the port
   * cell alone this is the old one-hex rule. Good for `reach` under half a
   * hex side, as every building and piece is.
   */
  contains(x: number, z: number, reach: number): boolean;
  /** Whether (x, z) lies in the port's own cell rather than one the town spilled onto. */
  inPortCell(x: number, z: number): boolean;
}

export function townCellsBound(town: TownCells): TownCellsBound {
  const inTown = new Set(town.cells.map(key));
  const portKey = key(town.cells[0]);
  return {
    contains(x, z, reach) {
      const h = worldToHex(x, z);
      if (!inTown.has(key(h))) return false;
      const [hx, , hz] = hexToWorld(h);
      for (const n of neighbors(h)) {
        if (inTown.has(key(n))) continue;
        const [nx, , nz] = hexToWorld(n);
        if ((x - hx) * ((nx - hx) / SQRT3) + (z - hz) * ((nz - hz) / SQRT3) > SQRT3 / 2 - reach) return false;
      }
      return true;
    },
    inPortCell: (x, z) => key(worldToHex(x, z)) === portKey,
  };
}
