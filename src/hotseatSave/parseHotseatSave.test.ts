import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { Caribbean, withGeneratedMap, withHotseatView } from "../game/Game";
import type { CaribbeanState } from "../game/Game";
import { generateMapFor } from "../game/mapRequest";
import { saveHotseat } from "./hotseatSave";
import { parseHotseatSave } from "./parseHotseatSave";

const request = { mapSize: "small", mapSeed: 7 } as const;
const map = { ...request, ...generateMapFor(request) };
const client = Client<CaribbeanState>({ game: withHotseatView(withGeneratedMap(Caribbean, map)), numPlayers: 2 });
const save = saveHotseat(client.store.getState(), map, 1_000);
const json = JSON.stringify(save);

describe("reading a saved game back", () => {
  it("finds none when nothing is stored", () => {
    expect(parseHotseatSave(null)).toEqual({ kind: "none" });
  });

  it("reads a save written by this version", () => {
    expect(parseHotseatSave(json)).toEqual({ kind: "saved", save: JSON.parse(json) });
  });

  it("calls a save of another schema version unreadable, as from another version of the game", () => {
    expect(parseHotseatSave(JSON.stringify({ ...save, version: 0 }))).toEqual({ kind: "unreadable", reason: "version" });
    expect(parseHotseatSave(JSON.stringify({ ...save, version: 1 }))).toEqual({ kind: "unreadable", reason: "version" });
  });

  it("calls anything else corrupt, without throwing", () => {
    const corrupt = [
      "",
      "{",
      "null",
      "42",
      "[]",
      JSON.stringify({ ...save, savedAt: "yesterday" }),
      JSON.stringify({ ...save, map: { mapSize: "huge", mapSeed: 7 } }),
      JSON.stringify({ ...save, map: { mapSize: "small", mapSeed: 1.5 } }),
      JSON.stringify({ ...save, state: null }),
      JSON.stringify({ ...save, state: { ...save.state, G: null } }),
      JSON.stringify({ ...save, state: { ...save.state, ctx: { ...save.state.ctx, numPlayers: 9 } } }),
      JSON.stringify({ ...save, state: { ...save.state, ctx: { ...save.state.ctx, turn: "one" } } }),
      JSON.stringify({ ...save, state: { ...save.state, plugins: undefined } }),
      JSON.stringify({ ...save, cellPatches: {} }),
      JSON.stringify({ ...save, cellPatches: [[1]] }),
      JSON.stringify({ ...save, regions: 3 }),
      JSON.stringify({ ...save, mapFingerprint: 7 }),
    ];
    for (const raw of corrupt) expect(parseHotseatSave(raw), raw.slice(0, 40)).toEqual({ kind: "unreadable", reason: "corrupt" });
  });
});
