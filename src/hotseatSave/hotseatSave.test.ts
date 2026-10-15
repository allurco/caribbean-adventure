/**
 * Saving a local hotseat game: what is kept, and that a restored match plays
 * on exactly as one never saved would, dice included.
 */
import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { Caribbean, withGeneratedMap, withHotseatView } from "../game/Game";
import type { CaribbeanState } from "../game/Game";
import { generateMapFor } from "../game/mapRequest";
import { STARTER_SHIP_CLASSES } from "../game/types";
import { restoreHotseat, saveHotseat, type MatchState } from "./hotseatSave";
import { hotseatStoreEnhancer } from "./hotseatStoreEnhancer";

const request = { mapSize: "small", mapSeed: 7 } as const;
const map = { ...request, ...generateMapFor(request) };
// A pinned dice seed, so the turns below are sure to bring merchants out
const game = { ...withHotseatView(withGeneratedMap(Caribbean, map)), seed: "hotseat-save" };

function newMatch(numPlayers: number, start?: MatchState) {
  const client = Client<CaribbeanState>({ game, numPlayers, enhancer: hotseatStoreEnhancer({ start, onState: () => {} }) });
  client.start();
  return client;
}

type Match = ReturnType<typeof newMatch>;

/** Both seats draft, then a few turns end: each turn's end moves and spawns NPCs with the match's dice. */
function playOpening(client: Match) {
  client.moves.pickCaptain(0, STARTER_SHIP_CLASSES[0]);
  client.moves.pickCaptain(1, STARTER_SHIP_CLASSES[1]);
}
function endTurns(client: Match, turns: number) {
  for (let i = 0; i < turns; i++) client.events.endTurn!();
}

/** Presses each step of the fight in turn, firing when a side must choose, until the first round is resolved. */
function fightOneRound(client: Match) {
  for (let step = 0; step < 10 && client.getState()!.G.combat?.round === 1; step++) {
    const stage = client.getState()!.G.combat!.stage;
    if (stage === "seamanship") client.moves.rollSeamanship();
    else if (stage === "chooseAction") client.moves.chooseCombatAction("fire");
    else if (stage === "fleeAttempt") client.moves.rollFleeAttempt();
    else if (stage === "cannons") client.moves.rollCannons();
    else if (stage === "resolution") client.moves.applyResolution();
  }
}

/** The parts of a match that decide how it plays on, as JSON (G is JSON by contract: -0 and undefined keys do not survive it). */
function playable(client: Match) {
  const { G, ctx, plugins, _stateID } = client.store.getState();
  return JSON.parse(JSON.stringify({ G, ctx, plugins, _stateID }));
}

/** The save as it would come back out of browser storage. */
function throughStorage(state: MatchState) {
  return JSON.parse(JSON.stringify(saveHotseat(state, map, 1_000))) as ReturnType<typeof saveHotseat>;
}

describe("a saved hotseat game", () => {
  it("plays on, after a restore, exactly as the match never saved: the same NPCs, the same dice", () => {
    const original = newMatch(2);
    playOpening(original);
    endTurns(original, 3);

    const restored = newMatch(2, restoreHotseat(throughStorage(original.store.getState()), map));
    expect(playable(restored)).toEqual(playable(original));
    const diceAtSave = original.store.getState().plugins.random;

    endTurns(original, 40);
    endTurns(restored, 40);
    expect(playable(restored)).toEqual(playable(original));
    // The turns spent the dice, and merchants came out on them
    expect(original.store.getState().plugins.random).not.toEqual(diceAtSave);
    expect(original.getState()!.G.npcIdCounter).toBeGreaterThan(0);
  });

  it("fights on, after a restore, with the same dice: one round of ship-to-ship combat", () => {
    const opened = newMatch(2);
    playOpening(opened);
    // The seat to play lies alongside the other's ship, in range of its guns
    const state: MatchState = opened.store.getState();
    const attackerId = state.ctx.currentPlayer;
    const defenderId = attackerId === "0" ? "1" : "0";
    const { q, r } = state.G.ships[attackerId].position;
    const alongside = { ...state.G.ships[defenderId], position: { q: q + 1, r, s: -q - 1 - r } };
    const original = newMatch(2, { ...state, G: { ...state.G, ships: { ...state.G.ships, [defenderId]: alongside } } });

    const restored = newMatch(2, restoreHotseat(throughStorage(original.store.getState()), map));
    for (const match of [original, restored]) {
      match.moves.attackShip(defenderId);
      fightOneRound(match);
    }
    // Seamanship and cannons were rolled: both sides threw the same dice
    expect(original.getState()!.ctx.phase).toBe("combat");
    expect(original.getState()!.G.combat!.round).toBeGreaterThan(1);
    expect(playable(restored)).toEqual(playable(original));
  });

  it("restores mid-draft, the hands still dealt", () => {
    const original = newMatch(2);
    original.moves.pickCaptain(0, STARTER_SHIP_CLASSES[0]);
    const restored = newMatch(2, restoreHotseat(throughStorage(original.store.getState()), map));
    expect(playable(restored)).toEqual(playable(original));
    restored.moves.pickCaptain(1, STARTER_SHIP_CLASSES[1]);
    expect(restored.getState()!.ctx.phase).toBe("main");
  });

  it("keeps the map's cells out of the save: they are generated again from its size and seed", () => {
    const original = newMatch(1);
    const save = saveHotseat(original.store.getState(), map, 1_000);
    expect(save.map).toEqual(request);
    expect(save.cellPatches).toEqual([]);
    expect(JSON.stringify(save).length).toBeLessThan(JSON.stringify(original.store.getState().G).length / 5);
  });

  it("keeps a cell that changed in play, and puts it back on the generated map", () => {
    const original = newMatch(1);
    const state: MatchState = original.store.getState();
    const portIndex = state.G.cells.findIndex((cell) => cell.market);
    const market = state.G.cells[portIndex].market!;
    const changed = { ...market, inDemandGood: null };
    const cells = state.G.cells.map((cell, i) => (i === portIndex ? { ...cell, market: changed } : cell));
    const save = JSON.parse(JSON.stringify(saveHotseat({ ...state, G: { ...state.G, cells } }, map, 1_000)));
    expect(save.cellPatches).toHaveLength(1);
    expect(restoreHotseat(save, map).G.cells[portIndex].market).toEqual(changed);
  });

  it("records when it was saved, and the save's schema version", () => {
    const save = saveHotseat(newMatch(1).store.getState(), map, 1_234);
    expect(save.savedAt).toBe(1_234);
    expect(save.version).toBe(2);
  });

  it("refuses a map that is not the save's", () => {
    const save = throughStorage(newMatch(1).store.getState());
    const other = { mapSize: "small", mapSeed: 8 } as const;
    expect(() => restoreHotseat(save, { ...other, ...generateMapFor(other) })).toThrow();
  });

  it("refuses the same size and seed when the generator now makes another world from them (an older build's save)", () => {
    const save = throughStorage(newMatch(1).store.getState());
    const portIndex = map.cells.findIndex((cell) => cell.market);
    const regenerated = { ...map, cells: map.cells.map((cell, i) => (i === portIndex ? { ...cell, market: undefined } : cell)) };
    expect(() => restoreHotseat(save, regenerated)).toThrow(/another world/);
    const renamed = { ...map, regions: map.regions.map((region, i) => (i === 0 ? { ...region, name: "Elsewhere" } : region)) };
    expect(() => restoreHotseat(save, renamed)).toThrow(/another world/);
  });
});
