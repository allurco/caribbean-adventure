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
 * An older save brought up to this version, or `value` as it is. Version 2
 * lacks `G.missionIdCounter` and `G.lootIdCounter` (#320), which the game
 * reads as 0: its clock-made ids (`loot-3-1712345678901`) can never be one of
 * the counters' (`loot-1`).
 *
 * The next bump must chain the steps, 2 → 3 then 3 → 4, so a version 2 save
 * still reaches the current version rather than stopping at 3.
 */
function migrate(value: Record<string, unknown>): Record<string, unknown> {
  return value.version === 2 ? { ...value, version: 3 } : value;
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
