import type { State } from "boardgame.io";
import type { CaribbeanState } from "../game/Game";
import type { GeneratedMap, MapRequest } from "../game/mapRequest";
import type { MapCell, Region } from "../game/types";

/** A local match's whole state in boardgame.io's store: G, ctx and the plugins' data (the dice's PRNG among them). */
export type MatchState = State<CaribbeanState>;

/** The save's schema; a save of any other version is not read (`parseHotseatSave`). */
export const HOTSEAT_SAVE_VERSION = 1;

/** G without the map, which is generated again from its size and seed. */
export type SavedG = Omit<CaribbeanState, "cells" | "regions">;

/**
 * A saved hotseat game: JSON, small enough for localStorage. The map's cells
 * and regions are left out, since `generateMapFor` makes the same ones from
 * `map`; only the cells that differ from the generated ones are kept.
 */
export interface HotseatSave {
  version: typeof HOTSEAT_SAVE_VERSION;
  /** When it was saved, in ms since the epoch. */
  savedAt: number;
  /** The map the match is played on. */
  map: MapRequest;
  /** The match: G without the map, ctx, the plugins' data, and the state's id. */
  state: { G: SavedG; ctx: MatchState["ctx"]; plugins: MatchState["plugins"]; _stateID: number };
  /** The cells that differ from the generated map's, by index. */
  cellPatches: [number, MapCell][];
  /** The regions, only when they differ from the generated map's. */
  regions: Region[] | null;
}

/**
 * The save of `state`, a match played on `map`, at `savedAt`. Undo history
 * and the last action's log are not kept: a restored match starts its undo
 * stack afresh, as a new turn does (the game offers no undo).
 */
export function saveHotseat(state: MatchState, map: GeneratedMap, savedAt: number): HotseatSave {
  const { cells, regions, ...rest } = state.G;
  return {
    version: HOTSEAT_SAVE_VERSION,
    savedAt,
    map: { mapSize: map.mapSize, mapSeed: map.mapSeed },
    state: { G: rest, ctx: state.ctx, plugins: state.plugins, _stateID: state._stateID },
    cellPatches: cells.flatMap((cell, i): [number, MapCell][] => (sameJson(cell, map.cells[i]) ? [] : [[i, cell]])),
    regions: sameJson(regions, map.regions) ? null : (regions ?? null),
  };
}

/**
 * The match `save` holds, on `map`, which must be the one generated from
 * `save.map`. Throws when it is not, or a patch falls outside it.
 */
export function restoreHotseat(save: HotseatSave, map: GeneratedMap): MatchState {
  if (map.mapSize !== save.map.mapSize || map.mapSeed !== save.map.mapSeed) {
    throw new Error("The save was played on another map");
  }
  const cells = [...map.cells];
  for (const [index, cell] of save.cellPatches) {
    if (!Number.isInteger(index) || index < 0 || index >= cells.length) throw new Error(`No cell ${index} on the map`);
    cells[index] = cell;
  }
  const { ctx, plugins, _stateID } = save.state;
  const G: CaribbeanState = { ...save.state.G, cells, regions: save.regions ?? map.regions };
  return { G, ctx, plugins, _stateID, _undo: [{ G, ctx, plugins }], _redo: [] };
}

function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
