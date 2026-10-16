import { describe, it, expect, vi } from "vitest";
import { Client as HeadlessClient } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { SHIP_MODELS, shipModelUrl } from "./board/shipModels";
import type { CaribbeanState } from "./game/Game";
import { parseDevUrlParams, showsDebugPanel } from "./board/devUrlParams";
import { INVALID_MOVE } from "boardgame.io/core";
import type { Move } from "boardgame.io";
import { Caribbean } from "./game/Game";

/** Presses the defender's choice as seat 0, the attacker, in a fight seat 1 is to choose in. */
function attackerChoosesForDefender(game: Game<CaribbeanState>): unknown {
  const move = game.phases!.combat.moves!.chooseCombatAction as Move<CaribbeanState>;
  const run = typeof move === "function" ? move : move.move;
  const combat = { attackerId: "0", defenderId: "1", isNPCCombat: false, stage: "chooseAction", seamanshipWinner: "1" };
  return run({ G: { combat } as unknown as CaribbeanState, playerID: "0" } as Parameters<typeof run>[0], "fire");
}

const preload = vi.hoisted(() => vi.fn());
vi.mock("@react-three/drei", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@react-three/drei")>()),
  useGLTF: Object.assign(() => undefined, { preload }),
}));

// The React client is replaced by its options, so a test can read the game it was given.
vi.mock("boardgame.io/react", () => ({ Client: (options: unknown) => options }));
// A tiny map, so the test does not wait on the generator.
vi.mock("./mapWorker/generateMapOffThread", () => ({
  generateMapOffThread: async () => ({ mapSize: "small", mapSeed: 1, cells: [], regions: [] }),
}));

describe("loading the game client", () => {
  it("starts fetching every ship model before the map is generated (#136)", async () => {
    // Importing the module is all App does before calling it, so the models load during the map-loading screen.
    await import("./loadGameClient");
    const urls = Object.values(SHIP_MODELS).flatMap((model) => (model ? [shipModelUrl(model, import.meta.env.BASE_URL)] : []));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(preload).toHaveBeenCalledWith(url, false, false);
  });

  it("starts solo by default: one seat, one captain hand (#278)", async () => {
    const { loadGameClient } = await import("./loadGameClient");
    const { game, numPlayers } = (await loadGameClient(undefined)) as unknown as { game: Game<CaribbeanState>; numPlayers: number };
    expect(numPlayers).toBe(1);
    const client = HeadlessClient<CaribbeanState>({ game, numPlayers });
    expect(Object.keys(client.getState()!.G.draftHands)).toEqual(["0"]);
  });

  it("keeps the hotseat client's view of the whole table: every seat's draft hand (#109)", async () => {
    const { loadGameClient } = await import("./loadGameClient");
    const { game, numPlayers } = (await loadGameClient(undefined, true, 2)) as unknown as { game: Game<CaribbeanState>; numPlayers: number };
    expect(numPlayers).toBe(2);
    // Like the hotseat client: one shared screen, no seat.
    const client = HeadlessClient<CaribbeanState>({ game, numPlayers });
    expect(Object.keys(client.getState()!.G.draftHands)).toEqual(["0", "1"]);
  });

  it("gives every seat on one page only its own view, through the local transport (#110)", async () => {
    const { loadSeatClient } = await import("./loadGameClient");
    const { game, multiplayer, numPlayers } = (await loadSeatClient(undefined, false, 3)) as unknown as {
      game: Game<CaribbeanState>;
      multiplayer: unknown;
      numPlayers: number;
    };
    expect(multiplayer).toBeDefined();
    expect(numPlayers).toBe(3);
    // Not the hotseat's whole table: a seat sees its own hand only.
    const seat = HeadlessClient<CaribbeanState>({ game, numPlayers, playerID: "1" });
    expect(Object.keys(seat.getState()!.G.draftHands)).toEqual(["1"]);
  });

  it("hides the dev debug panel for the seats on one page, so its tab does not cover End Turn or the turn bar (#110)", async () => {
    const { loadSeatClient } = await import("./loadGameClient");
    const { debug } = (await loadSeatClient(undefined, showsDebugPanel(parseDevUrlParams("?seats=1")))) as unknown as { debug: unknown };
    expect(debug).toBe(false);
  });

  it("opens the dev debug panel collapsed, so it does not cover the port panel or the tavern; '.' or its toggle opens it", async () => {
    const { loadGameClient, loadSeatClient } = await import("./loadGameClient");
    const hotseat = (await loadGameClient(undefined, true)) as unknown as { debug: unknown };
    const seats = (await loadSeatClient(undefined, true)) as unknown as { debug: unknown };
    expect(hotseat.debug).toEqual({ collapseOnLoad: true });
    expect(seats.debug).toEqual({ collapseOnLoad: true });
  });

  it("holds each seat on one page to its own combat steps (#113 review); the hotseat table keeps pressing both sides", async () => {
    const { loadSeatClient, loadGameClient } = await import("./loadGameClient");
    const seated = (await loadSeatClient(undefined, false, 2)) as unknown as { game: Game<CaribbeanState> };
    expect(attackerChoosesForDefender(seated.game)).toBe(INVALID_MOVE);
    const hotseat = (await loadGameClient(undefined, true, 2)) as unknown as { game: Game<CaribbeanState> };
    expect(hotseat.game.phases!.combat.moves).toBe(Caribbean.phases!.combat.moves);
  });

  it("continues a saved voyage on its seats, saving every state it reaches from there (#300)", async () => {
    const { loadGameClient } = await import("./loadGameClient");
    const { saveHotseat } = await import("./hotseatSave/hotseatSave");
    const map = { mapSize: "small", mapSeed: 1, cells: [] } as const;
    // A two-seat match, then saved, on the mocked map
    const before = (await loadGameClient(undefined, true, 2)) as unknown as { game: Game<CaribbeanState> };
    const played = HeadlessClient<CaribbeanState>({ game: before.game, numPlayers: 2 });
    played.moves.pickCaptain(1, "Sloop");
    const save = JSON.parse(JSON.stringify(saveHotseat(played.store.getState(), { ...map, cells: [], regions: [] }, 0)));

    const states: unknown[] = [];
    const options = (await loadGameClient(undefined, true, 1, { restore: save, onState: (state) => states.push(state) })) as unknown as {
      game: Game<CaribbeanState>;
      numPlayers: number;
      enhancer: Parameters<typeof HeadlessClient>[0]["enhancer"];
    };
    expect(options.numPlayers).toBe(2);
    const continued = HeadlessClient<CaribbeanState>({ game: options.game, numPlayers: options.numPlayers, enhancer: options.enhancer });
    expect(continued.getState()!.ctx.currentPlayer).toBe("1");
    expect(continued.getState()!.G.ships["0"].captain).toEqual(played.getState()!.G.ships["0"].captain);
    // Not saved again until it is played on, so the save keeps its time
    expect(states).toEqual([]);
    continued.moves.pickCaptain(0, "Sloop");
    expect(states.length).toBeGreaterThan(0);
  });
});
