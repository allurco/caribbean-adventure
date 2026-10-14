import { describe, it, expect, vi } from "vitest";
import { Client as HeadlessClient } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { SHIP_MODELS, shipModelUrl } from "./board/shipModels";
import { PLAYER_COUNT, type CaribbeanState } from "./game/Game";

const preload = vi.hoisted(() => vi.fn());
vi.mock("@react-three/drei", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@react-three/drei")>()),
  useGLTF: Object.assign(() => undefined, { preload }),
}));

// The React client is replaced by its options, so a test can read the game it was given.
vi.mock("boardgame.io/react", () => ({ Client: (options: unknown) => options }));
// A tiny map, so the test does not wait on the generator.
vi.mock("./mapWorker/generateMapOffThread", () => ({
  generateMapOffThread: async () => ({ mapSize: "small", mapSeed: 1, cells: [] }),
}));

describe("loading the game client", () => {
  it("starts fetching every ship model before the map is generated (#136)", async () => {
    // Importing the module is all App does before calling it, so the models load during the map-loading screen.
    await import("./loadGameClient");
    const urls = Object.values(SHIP_MODELS).flatMap((model) => (model ? [shipModelUrl(model, import.meta.env.BASE_URL)] : []));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(preload).toHaveBeenCalledWith(url, false, false);
  });

  it("keeps the hotseat client's view of the whole table: every seat's draft hand (#109)", async () => {
    const { loadGameClient } = await import("./loadGameClient");
    const { game } = (await loadGameClient(undefined)) as unknown as { game: Game<CaribbeanState> };
    // Like the hotseat client: one shared screen, no seat.
    const client = HeadlessClient<CaribbeanState>({ game, numPlayers: 2 });
    expect(Object.keys(client.getState()!.G.draftHands)).toEqual(["0", "1"]);
  });

  it("gives every seat on one page only its own view, through the local transport (#110)", async () => {
    const { loadSeatClient } = await import("./loadGameClient");
    const { game, multiplayer, numPlayers } = (await loadSeatClient(undefined)) as unknown as {
      game: Game<CaribbeanState>;
      multiplayer: unknown;
      numPlayers: number;
    };
    expect(multiplayer).toBeDefined();
    expect(numPlayers).toBe(PLAYER_COUNT);
    // Not the hotseat's whole table: a seat sees its own hand only.
    const seat = HeadlessClient<CaribbeanState>({ game, numPlayers, playerID: "1" });
    expect(Object.keys(seat.getState()!.G.draftHands)).toEqual(["1"]);
  });
});
