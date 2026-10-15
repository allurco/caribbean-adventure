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
 * throws: anything that is not a save of this schema version is unreadable.
 * Checks the shape a restore and the start screen rely on, not every field
 * of G.
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
  if (typeof value.version === "number" && value.version !== HOTSEAT_SAVE_VERSION) return { kind: "unreadable", reason: "version" };
  return isHotseatSave(value) ? { kind: "saved", save: value } : { kind: "unreadable", reason: "corrupt" };
}

function isHotseatSave(value: Record<string, unknown>): value is Record<string, unknown> & HotseatSave {
  const { version, savedAt, map, mapFingerprint, state, cellPatches, regions } = value;
  if (version !== HOTSEAT_SAVE_VERSION || typeof savedAt !== "number" || !Number.isFinite(savedAt)) return false;
  if (!isRecord(map) || !MAP_SIZES.includes(map.mapSize) || !isValidMapSeed(map.mapSeed)) return false;
  if (typeof mapFingerprint !== "string") return false;
  if (!isRecord(state) || !isRecord(state.G) || !isRecord(state.ctx) || !isRecord(state.plugins)) return false;
  if (typeof state._stateID !== "number") return false;
  const { numPlayers, turn } = state.ctx;
  if (typeof numPlayers !== "number" || !isValidSeatCount(numPlayers) || typeof turn !== "number") return false;
  if (!Array.isArray(cellPatches) || !cellPatches.every(isCellPatch)) return false;
  return regions === null || Array.isArray(regions);
}

function isCellPatch(patch: unknown): boolean {
  return Array.isArray(patch) && patch.length === 2 && Number.isInteger(patch[0]) && isRecord(patch[1]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
