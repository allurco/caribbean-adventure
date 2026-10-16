import { describe, it, expect, vi, afterEach } from "vitest";
import { Client } from "boardgame.io/client";
import { Caribbean, withGeneratedMap, withHotseatView } from "../game/Game";
import type { CaribbeanState } from "../game/Game";
import { generateMapFor } from "../game/mapRequest";
import { hotseatStoreEnhancer } from "./hotseatStoreEnhancer";
import { startHotseatSession } from "./hotseatSession";
import { readHotseatSave, type SaveStorage } from "./saveStorage";

const request = { mapSize: "small", mapSeed: 7 } as const;
const map = { ...request, ...generateMapFor(request) };

function memoryStorage(): SaveStorage {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
}

describe("a hotseat session", () => {
  afterEach(() => vi.useRealTimers());

  it("autosaves the match as it is played, and writes it at once when the page is left", () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const session = startHotseatSession({ storage, now: () => 42, delayMs: 1_000 });
    const { onState } = session.persistence();
    const client = Client<CaribbeanState>({
      game: withHotseatView(withGeneratedMap(Caribbean, map)),
      numPlayers: 1,
      enhancer: hotseatStoreEnhancer({ onState: (state) => onState(state, map) }),
    });
    client.start();
    vi.advanceTimersByTime(1_000);
    // Not played yet: nothing to save
    expect(readHotseatSave(storage)).toEqual({ kind: "none" });

    client.moves.pickCaptain(0, "Sloop");
    vi.advanceTimersByTime(1_000);
    const first = readHotseatSave(storage);
    expect(first.kind === "saved" && first.save.state.ctx.phase).toBe("main");

    client.events.endTurn!();
    expect(session.flush()).toEqual({ ok: true });
    const second = readHotseatSave(storage);
    expect(second.kind === "saved" && second.save.state.ctx.turn).toBe(first.kind === "saved" && first.save.state.ctx.turn + 1);
    expect(second.kind === "saved" && second.save.savedAt).toBe(42);
  });

  it("tells of a failed write", () => {
    const results: unknown[] = [];
    const session = startHotseatSession({ storage: null, now: () => 0, delayMs: 1_000, onSaveResult: (r) => results.push(r) });
    const state = Client<CaribbeanState>({ game: withHotseatView(withGeneratedMap(Caribbean, map)), numPlayers: 1 }).store.getState();
    session.persistence().onState(state, map);
    expect(session.flush()).toEqual({ ok: false, reason: "unavailable" });
    expect(results).toEqual([{ ok: false, reason: "unavailable" }]);
  });
});
