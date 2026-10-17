import type { State } from "boardgame.io";
import type { CaribbeanState } from "../game/Game";
import type { GeneratedMap, MapRequest } from "../game/mapRequest";
import type { MapCell, Region } from "../game/types";

/** A local match's whole state in boardgame.io's store: G, ctx and the plugins' data (the dice's PRNG among them). */
export type MatchState = State<CaribbeanState>;

/**
 * The save's schema; a save of any other version is not read
 * (`parseHotseatSave`), so the start screen offers New game instead.
 *
 * Bump it whenever the shape of a save changes: a field of the save, or of
 * the state it holds (G, ctx, the plugins' data). A save from before the
 * change would restore into state the game no longer expects and could crash.
 * `hotseatSaveShape.test.ts` pins that shape and fails when it changes; bump
 * this, then update the pinned shape. When an older save can be brought up
 * to date, `parseHotseatSave` migrates it rather than setting it aside.
 *
 * - 3: G counts its mission and loot ids, `G.missionIdCounters` (by seat)
 *   and `G.lootIdCounter` (#320). A version 2 save lacks them, which the game
 *   reads as 0, so it migrates as it is.
 * - 4: round 1 of a fight is the ambush, and each volley's damage lands as
 *   it is fired, recorded in `G.combat.volleys` (#346). A version 3 save with
 *   no fight on migrates as it is; one made mid-fight is set aside.
 * - 5: the open sea wears coasters as their turn ends, the last time kept in
 *   `G.seaWear`, by seat (#340). A version 4 save lacks it, which means the sea has
 *   worn no ship yet, so it migrates as it is.
 * - 6: from round 2 each captain rolls its own die of the draw (#347): a new
 *   combat stage, `defenderSeamanship`, waits on the defender's. A version 5
 *   save migrates as it is, mid-fight too: its `seamanship` stage waits on
 *   the attacker's roll, as version 6's does.
 * - 7: every volley is aimed by the ship firing it (#348): `rollCannons` and
 *   the answer, a new combat stage, `returnFire`, take an aim, recorded on
 *   each of `G.combat.volleys`. A version 6 save migrates as it is, mid-fight
 *   too: each of its stages is one version 7 still has, and a volley it
 *   recorded with no aim went to the hull, as the board reads it.
 * - 8: the event deck (#246): `G.eventDeck` holds the draw pile and the
 *   event log, and merchants put to sea only through its convoy cards. A
 *   version 7 save lacks it, which reads as an empty pile, shuffled at the
 *   first draw, so it migrates as it is.
 * - 9: hits land at random and the round settles itself (#380): each volley
 *   records where its hits landed (`locations`, no aim), and the settled
 *   round stays in `G.lastRound`. A version 8 save migrates as it is, mid-fight
 *   too: its volleys' aims read as every hit on the aim (`hitCountsOf`), its
 *   `returnFire` takes no aim now, and a fight at its `resolution` settles by
 *   the legacy `applyResolution` move, the panel's End Round.
 * - 10: each volley records the shots that added to it and the damage it
 *   dealt (`shotBonuses`, `dealt`), and the settled round the ships it sank and
 *   left derelict (`sunk`, `leftDerelict`), so the board reads them as they
 *   were. A version 9 save lacks them, which reads as none (the volley line
 *   names where its hits landed only), so it migrates as it is.
 * - 11: boarding is a crew fight (#350): Board goes to a new combat stage,
 *   `boarding`, and the round it ends records it (`G.lastRound.boarding`);
 *   a player ship's crew stops at 1. A version 10 save migrates as it is,
 *   mid-fight too: each of its stages is one version 11 still has, a Board
 *   chosen from it goes on to the boarding, and its rounds record none.
 */
export const HOTSEAT_SAVE_VERSION = 11;

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
  /**
   * The world `map` generated when the game was saved (`mapFingerprint`): a
   * build whose generator makes another world from the same size and seed
   * refuses the save rather than restore it onto the wrong map.
   */
  mapFingerprint: string;
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
  const generated = generatedJson(map);
  return {
    version: HOTSEAT_SAVE_VERSION,
    savedAt,
    map: { mapSize: map.mapSize, mapSeed: map.mapSeed },
    mapFingerprint: generated.fingerprint,
    state: { G: rest, ctx: state.ctx, plugins: state.plugins, _stateID: state._stateID },
    cellPatches: cells.flatMap((cell, i): [number, MapCell][] =>
      cell === map.cells[i] || JSON.stringify(cell) === generated.cells[i] ? [] : [[i, cell]]
    ),
    regions: regions === map.regions || JSON.stringify(regions) === generated.regions ? null : (regions ?? null),
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
  if (generatedJson(map).fingerprint !== save.mapFingerprint) {
    throw new Error("This build generates another world from the save's map size and seed");
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

/** A generated map as JSON, each cell on its own, and its fingerprint. */
interface GeneratedJson {
  cells: string[];
  regions: string;
  fingerprint: string;
}

// A map is generated once per voyage and never changed, so its JSON is
// worked out once, not on every autosave.
const generatedJsonCache = new WeakMap<GeneratedMap, GeneratedJson>();

function generatedJson(map: GeneratedMap): GeneratedJson {
  let json = generatedJsonCache.get(map);
  if (!json) {
    const cells = map.cells.map((cell) => JSON.stringify(cell));
    const regions = JSON.stringify(map.regions ?? null);
    json = { cells, regions, fingerprint: mapFingerprint(cells, regions) };
    generatedJsonCache.set(map, json);
  }
  return json;
}

/**
 * A fingerprint of a generated world: a 64-bit FNV-1a hash (two 32-bit
 * halves) of its cells' and regions' JSON, as hex. Not cryptographic: it
 * only tells one generator's world from another's.
 */
function mapFingerprint(cells: readonly string[], regions: string): string {
  let low = 0x811c9dc5;
  let high = 0x050c5d1f;
  const mix = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      low = Math.imul(low ^ code, 0x01000193);
      high = Math.imul(high ^ code, 0x01000193) ^ (low >>> 15);
    }
  };
  for (const cell of cells) mix(cell + "\n");
  mix(regions);
  return (high >>> 0).toString(16).padStart(8, "0") + (low >>> 0).toString(16).padStart(8, "0");
}
