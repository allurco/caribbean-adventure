/**
 * The shape of a hotseat save, pinned (#300). A save restores straight into
 * boardgame.io's store, so a save made before G, ctx or the save itself
 * changed shape would restore into state this build does not expect. When a
 * test here fails, the shape changed: bump HOTSEAT_SAVE_VERSION (so older
 * saves are set aside, not restored), then update the pinned shape
 * (`npx vitest run src/hotseatSave/hotseatSaveShape.test.ts -u`).
 */
import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { Caribbean, withGeneratedMap, withHotseatView } from "../game/Game";
import type { CaribbeanState } from "../game/Game";
import { generateMapFor } from "../game/mapRequest";
import { STARTER_SHIP_CLASSES } from "../game/types";
import { HOTSEAT_SAVE_VERSION, saveHotseat } from "./hotseatSave";

const request = { mapSize: "small", mapSeed: 7 } as const;
const map = { ...request, ...generateMapFor(request) };
const game = { ...withHotseatView(withGeneratedMap(Caribbean, map)), seed: "hotseat-save-shape" };

/** A two-seat match with fixed dice: drafted, then a dozen turns, so NPCs are out and the dice spent. */
function playedSave() {
  const client = Client<CaribbeanState>({ game, numPlayers: 2 });
  client.moves.pickCaptain(0, STARTER_SHIP_CLASSES[0]);
  client.moves.pickCaptain(1, STARTER_SHIP_CLASSES[1]);
  for (let i = 0; i < 12; i++) client.events.endTurn!();
  return JSON.parse(JSON.stringify(saveHotseat(client.store.getState(), map, 0)));
}

type Shape = string | Shape[] | { [key: string]: Shape };

/**
 * The shape of a JSON value: an object's keys (a record keyed by ids, such as
 * ships by seat or NPCs by id, as one `<id>` entry), an array's elements
 * merged into one, and each leaf's type. Values do not count, only shape.
 */
function shapeOf(value: unknown): Shape {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length === 0 ? [] : [value.map(shapeOf).reduce(mergeShapes)];
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 0 && entries.every(([key]) => /\d/.test(key))) {
      return { "<id>": entries.map(([, v]) => shapeOf(v)).reduce(mergeShapes) };
    }
    return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, shapeOf(v)]));
  }
  return typeof value;
}

function mergeShapes(a: Shape, b: Shape): Shape {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === 0 ? b : b.length === 0 ? a : [mergeShapes(a[0], b[0])];
  if (isObjectShape(a) && isObjectShape(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) => x.localeCompare(y));
    return Object.fromEntries(keys.map((key) => [key, key in a && key in b ? mergeShapes(a[key], b[key]) : (a[key] ?? b[key])]));
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return a;
  return [...new Set([...String(JSON.stringify(a)).split("|"), ...String(JSON.stringify(b)).split("|")])].sort().join("|");
}

function isObjectShape(shape: Shape): shape is { [key: string]: Shape } {
  return typeof shape === "object" && !Array.isArray(shape);
}

describe("the hotseat save's shape (bump HOTSEAT_SAVE_VERSION when it changes)", () => {
  it("keeps the same top-level fields of G", () => {
    const client = Client<CaribbeanState>({ game, numPlayers: 2 });
    expect(Object.keys(client.getState()!.G).sort()).toEqual([
      "bountyClaims",
      "captainDeck",
      "cells",
      "draftHands",
      "eventDeck",
      "floatingLoot",
      "lootIdCounter",
      "mapSeed",
      "mapSize",
      "missionIdCounters",
      "movesUsed",
      "npcIdCounter",
      "npcs",
      "pirates",
      "regions",
      "ships",
      "wrap",
    ]);
  });

  it("keeps the same shape: the save, G, ctx and the plugins' data", () => {
    // Named by the version, so a bump starts a new pinned shape and drops the old one.
    expect(shapeOf(playedSave())).toMatchSnapshot(`save version ${HOTSEAT_SAVE_VERSION}`);
  });
});
