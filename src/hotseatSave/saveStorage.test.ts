import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { Caribbean, withGeneratedMap, withHotseatView } from "../game/Game";
import type { CaribbeanState } from "../game/Game";
import { generateMapFor } from "../game/mapRequest";
import { saveHotseat } from "./hotseatSave";
import {
  HOTSEAT_SAVE_KEY,
  SET_ASIDE_SAVE_KEY,
  clearHotseatSave,
  persistHotseatState,
  readHotseatSave,
  setAsideHotseatSave,
  type SaveStorage,
} from "./saveStorage";

const request = { mapSize: "small", mapSeed: 7 } as const;
const map = { ...request, ...generateMapFor(request) };
const state = Client<CaribbeanState>({ game: withHotseatView(withGeneratedMap(Caribbean, map)), numPlayers: 1 }).store.getState();

function memoryStorage(): SaveStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

/** A storage that throws as browsers do when the quota is full. */
function fullStorage(): SaveStorage {
  return {
    ...memoryStorage(),
    setItem: () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    },
  };
}

/** A storage every call to which throws, as with site data blocked. */
const blockedStorage: SaveStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("keeping the hotseat game in browser storage", () => {
  it("writes the match and reads it back", () => {
    const storage = memoryStorage();
    expect(persistHotseatState(storage, state, map, 5_000)).toEqual({ ok: true });
    const read = readHotseatSave(storage);
    expect(read.kind).toBe("saved");
    expect(read.kind === "saved" && read.save.savedAt).toBe(5_000);
    expect(JSON.parse(storage.items.get(HOTSEAT_SAVE_KEY)!)).toEqual(JSON.parse(JSON.stringify(saveHotseat(state, map, 5_000))));
  });

  it("forgets a finished match, so there is nothing to continue", () => {
    const storage = memoryStorage();
    persistHotseatState(storage, state, map, 5_000);
    const over = { ...state, ctx: { ...state.ctx, gameover: { winner: "0" } } };
    expect(persistHotseatState(storage, over, map, 6_000)).toEqual({ ok: true });
    expect(readHotseatSave(storage)).toEqual({ kind: "none" });
  });

  it("reports a full storage as such, and keeps the last save it made", () => {
    const storage = memoryStorage();
    persistHotseatState(storage, state, map, 5_000);
    const full = { ...fullStorage(), getItem: storage.getItem, removeItem: storage.removeItem };
    expect(persistHotseatState(full, state, map, 6_000)).toEqual({ ok: false, reason: "quota" });
    const read = readHotseatSave(storage);
    expect(read.kind === "saved" && read.save.savedAt).toBe(5_000);
  });

  it("reports storage that is blocked or missing, and never throws", () => {
    expect(persistHotseatState(blockedStorage, state, map, 5_000)).toEqual({ ok: false, reason: "unavailable" });
    expect(persistHotseatState(null, state, map, 5_000)).toEqual({ ok: false, reason: "unavailable" });
    expect(readHotseatSave(blockedStorage)).toEqual({ kind: "none" });
    expect(readHotseatSave(null)).toEqual({ kind: "none" });
    expect(() => clearHotseatSave(blockedStorage)).not.toThrow();
  });

  it("clears the save", () => {
    const storage = memoryStorage();
    persistHotseatState(storage, state, map, 5_000);
    clearHotseatSave(storage);
    expect(readHotseatSave(storage)).toEqual({ kind: "none" });
  });

  it("reads a corrupt save as unreadable", () => {
    const storage = memoryStorage();
    storage.setItem(HOTSEAT_SAVE_KEY, "{not json");
    expect(readHotseatSave(storage)).toEqual({ kind: "unreadable", reason: "corrupt" });
  });

  it("sets aside a save that could not be restored: no longer offered, but kept apart, not lost", () => {
    const storage = memoryStorage();
    persistHotseatState(storage, state, map, 5_000);
    const raw = storage.items.get(HOTSEAT_SAVE_KEY);
    setAsideHotseatSave(storage);
    expect(readHotseatSave(storage)).toEqual({ kind: "none" });
    expect(storage.items.get(SET_ASIDE_SAVE_KEY)).toBe(raw);
    expect(() => setAsideHotseatSave(blockedStorage)).not.toThrow();
    expect(() => setAsideHotseatSave(null)).not.toThrow();
  });
});
