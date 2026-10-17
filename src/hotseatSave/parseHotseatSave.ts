import { isValidMapSeed } from "../game/mapSeed";
import { isValidSeatCount } from "../game/seats";
import { HOTSEAT_SAVE_VERSION, type HotseatSave } from "./hotseatSave";

/** What browser storage held: no save, a save to continue, or one that cannot be read. */
export type HotseatSaveRead =
  | { kind: "none" }
  | { kind: "saved"; save: HotseatSave }
  /** `version`: written by another version of the game; `corrupt`: not a save at all. */
  | { kind: "unreadable"; reason: "version" | "corrupt" };

const MAP_SIZES: readonly unknown[] = ["small", "medium", "large"];

/**
 * The save in `raw`, the stored JSON (null when nothing is stored). Never
 * throws: anything that is not a save of this schema version, or of an older
 * one it migrates (`migrate`), is unreadable. Checks the shape a restore and
 * the start screen rely on, not every field of G.
 */
export function parseHotseatSave(raw: string | null): HotseatSaveRead {
  if (raw === null) return { kind: "none" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "unreadable", reason: "corrupt" };
  }
  if (!isRecord(value)) return { kind: "unreadable", reason: "corrupt" };
  const current = migrate(value);
  if (typeof current.version === "number" && current.version !== HOTSEAT_SAVE_VERSION) return { kind: "unreadable", reason: "version" };
  return isHotseatSave(current) ? { kind: "saved", save: current } : { kind: "unreadable", reason: "corrupt" };
}

/**
 * An older save brought up to this version, or `value` as it is, step by
 * step so an old save goes through every later one. Version 2 lacks
 * `G.missionIdCounters` and `G.lootIdCounter` (#320), whose counts the game
 * reads as 0: its clock-made ids (`loot-3-1712345678901`) can never be one
 * of the counters' (`loot-1`). Version 3 fights by the rules from before the
 * ambush (#346): a save with no fight on is the same as version 4's, but one
 * made mid-fight stays at version 3, and is set aside. Version 4 lacks
 * `G.seaWear` (#340), which means the sea has worn no ship yet. Version 5
 * rolled both dice of the draw at once; version 6 waits on each captain's
 * (#347), but a version 5 fight at the draw waits on the attacker's die
 * either way, so every version 5 save is version 6's. Version 6 fired
 * unaimed volleys (#348); its fights wait on steps version 7 still has, and
 * a volley it recorded with no aim is read as aimed at the hull, so every
 * version 6 save is version 7's. Version 7 lacks `G.eventDeck` (#246),
 * which the game reads as an empty pile, shuffled at the first draw, and an
 * empty log. Version 8 aimed its volleys (#348); version 9's land at random
 * and settle the round by themselves (#380), but an aimed volley reads as
 * every hit on its aim and a fight at version 8's resolution still settles
 * (the legacy `applyResolution`), so every version 8 save is version 9's.
 * Version 9 recorded no volley's shots or damage and no round's sunk or
 * derelict ships, which read as none, so every version 9 save is version 10's.
 * Version 10 fought no crew fight (#350); its fights wait on steps version
 * 11 still has, so every version 10 save is version 11's.
 */
function migrate(value: Record<string, unknown>): Record<string, unknown> {
  let current = value;
  if (current.version === 2) current = { ...current, version: 3 };
  if (current.version === 3 && !midFight(current)) current = { ...current, version: 4 };
  if (current.version === 4) current = { ...current, version: 5 };
  if (current.version === 5) current = { ...current, version: 6 };
  if (current.version === 6) current = { ...current, version: 7 };
  if (current.version === 7) current = { ...current, version: 8 };
  if (current.version === 8) current = { ...current, version: 9 };
  if (current.version === 9) current = { ...current, version: 10 };
  if (current.version === 10) current = { ...current, version: 11 };
  return current;
}

/** Whether a save was made while a fight was on. */
function midFight(value: Record<string, unknown>): boolean {
  const { state } = value;
  return isRecord(state) && isRecord(state.G) && state.G.combat != null;
}

function isHotseatSave(value: Record<string, unknown>): value is Record<string, unknown> & HotseatSave {
  const { version, savedAt, map, mapFingerprint, state, cellPatches, regions } = value;
  if (version !== HOTSEAT_SAVE_VERSION || typeof savedAt !== "number" || !Number.isFinite(savedAt)) return false;
  if (!isRecord(map) || !MAP_SIZES.includes(map.mapSize) || !isValidMapSeed(map.mapSeed)) return false;
  if (typeof mapFingerprint !== "string") return false;
  if (!isRecord(state) || !isRecord(state.G) || !isRecord(state.ctx) || !isRecord(state.plugins)) return false;
  if (typeof state._stateID !== "number") return false;
  const { numPlayers, turn, phase } = state.ctx;
  if (typeof numPlayers !== "number" || !isValidSeatCount(numPlayers) || !Number.isInteger(turn) || typeof phase !== "string") return false;
  const { ships, lostShips } = state.G;
  if (!isShipTable(ships) || (lostShips !== undefined && !isShipTable(lostShips))) return false;
  if (!Array.isArray(cellPatches) || !cellPatches.every(isCellPatch)) return false;
  return regions === null || Array.isArray(regions);
}

/** A table of ships by seat, as the start screen reads their captains: each a ship whose captain, when it has one, is named. */
function isShipTable(ships: unknown): boolean {
  return isRecord(ships) && Object.values(ships).every((ship) => isRecord(ship) && (ship.captain == null || (isRecord(ship.captain) && typeof ship.captain.name === "string")));
}

function isCellPatch(patch: unknown): boolean {
  return Array.isArray(patch) && patch.length === 2 && Number.isInteger(patch[0]) && isRecord(patch[1]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
