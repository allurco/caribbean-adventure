import type { GeneratedMap } from "../game/mapRequest";
import { saveHotseat, type MatchState } from "./hotseatSave";
import { parseHotseatSave, type HotseatSaveRead } from "./parseHotseatSave";

/**
 * The local hotseat game's one save slot, in localStorage. The save leaves
 * the map out (it is generated again from its size and seed), so even a
 * large map's match is tens of kilobytes, far inside the ~5 MB quota.
 * Storage can be missing or throw (private mode, blocked site data, a full
 * quota), so every call is guarded and none throws.
 */
export const HOTSEAT_SAVE_KEY = "caribbean.hotseatSave";

/** The part of `Storage` the save uses, so tests can pass a stand-in. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Whether a save was written; when not, because storage is full or cannot be used at all. */
export type SaveWriteResult = { ok: true } | { ok: false; reason: "quota" | "unavailable" };

/** localStorage, or null where reading it throws (blocked site data). */
export function browserSaveStorage(): SaveStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The stored save; none when storage cannot be read. */
export function readHotseatSave(storage: SaveStorage | null): HotseatSaveRead {
  let raw: string | null;
  try {
    raw = storage?.getItem(HOTSEAT_SAVE_KEY) ?? null;
  } catch {
    return { kind: "none" };
  }
  return parseHotseatSave(raw);
}

/**
 * Saves `state`, the match on `map`, at `now` (ms since the epoch). A
 * finished match is cleared instead: there is nothing left to continue.
 * When the write fails the last save stays as it was.
 */
export function persistHotseatState(storage: SaveStorage | null, state: MatchState, map: GeneratedMap, now: number): SaveWriteResult {
  if (!storage) return { ok: false, reason: "unavailable" };
  try {
    if (state.ctx.gameover !== undefined) storage.removeItem(HOTSEAT_SAVE_KEY);
    else storage.setItem(HOTSEAT_SAVE_KEY, JSON.stringify(saveHotseat(state, map, now)));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: isQuotaError(error) ? "quota" : "unavailable" };
  }
}

/** Removes the save, if storage allows. */
export function clearHotseatSave(storage: SaveStorage | null): void {
  try {
    storage?.removeItem(HOTSEAT_SAVE_KEY);
  } catch {
    // Nothing to do: a save that cannot be removed cannot be read either.
  }
}

function isQuotaError(error: unknown): boolean {
  // Chrome and Safari name it QuotaExceededError, older Firefox NS_ERROR_DOM_QUOTA_REACHED.
  return error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
}
