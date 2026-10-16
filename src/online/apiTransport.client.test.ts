import { describe, expect, it } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game, State } from "boardgame.io";
import { Caribbean } from "../game/Game";
import { createShipState } from "../game/economy";
import { hex, hexGrid, type Hex } from "../game/hex";
import type { CaribbeanState, MapCell } from "../game/types";
import type { MapSizeId } from "../game/mapConfig";
import { apiTransport } from "./apiTransport";
import type { MatchSendResult, MatchSyncApi, SeatView } from "./matchSync";

const MATCH = "0f8fad5b-d9cb-469f-a165-70867728950e";

/** A game already in its main phase on a disc of water, a Sloop (4 moves) for player 0. */
const game: Game<CaribbeanState> = (() => {
  const phases = Caribbean.phases!;
  return {
    ...Caribbean,
    setup: () => ({
      cells: hexGrid(5).map((h): MapCell => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 })),
      ships: { "0": createShipState(hex(0, 0), "Sloop"), "1": createShipState(hex(-4, 0), "Frigate") },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
      pirates: {},
      bountyClaims: [],
      movesUsed: 0,
    }),
    phases: { ...phases, draft: { ...phases.draft, start: false }, main: { ...phases.main, start: true } },
  };
})();

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A seat's client over the /api transport, against a "server" that runs the
 * same game and answers each action only when told to (network latency).
 */
function onlineSeat() {
  const server = Client<CaribbeanState>({ game, numPlayers: 2 });
  server.start();
  const pending: (() => void)[] = [];
  const api: MatchSyncApi = {
    getMatch: async () => ({ ok: true, changed: true, seat: "0", state: server.store.getState() as SeatView }),
    sendAction: (_id, _stateID, action) =>
      new Promise<MatchSendResult>((resolve) =>
        pending.push(() => {
          if (action.type === "MAKE_MOVE") server.moves[action.payload.type](...action.payload.args);
          resolve({ ok: true, state: server.store.getState() as SeatView });
        })
      ),
  };
  const seat = Client<CaribbeanState>({
    game,
    numPlayers: 2,
    playerID: "0",
    matchID: MATCH,
    multiplayer: apiTransport({ api, initial: server.store.getState() as State as SeatView, onError: () => {} }),
  });
  const shown: string[] = [];
  seat.subscribe((s) => {
    const at = s?.G.ships["0"]?.position;
    if (at && shown.at(-1) !== `${at.q},${at.r}`) shown.push(`${at.q},${at.r}`);
  });
  seat.start();
  /** Answers every action sent so far, in order, letting each answer land. */
  const answerAll = async () => {
    await tick();
    while (pending.length > 0) {
      pending.shift()!();
      await tick();
    }
  };
  return { seat, shown, answerAll };
}

describe("an online seat sailing a route (#113)", () => {
  it("never shows its ship back on a hex it has sailed on from while the server catches up", async () => {
    const { seat, shown, answerAll } = onlineSeat();
    const route: Hex[] = [hex(1, 0), hex(2, 0), hex(3, 0)];
    // The board sends each step once the last shows applied: the client shows each at once.
    for (const h of route) seat.moves.moveShip(h.q, h.r);
    expect(shown).toEqual(["0,0", "1,0", "2,0", "3,0"]);
    await answerAll();
    // The server's answers to the earlier steps must not take the ship back along the route
    expect(shown).toEqual(["0,0", "1,0", "2,0", "3,0"]);
    expect(seat.getState()!.G.ships["0"].position).toEqual(hex(3, 0));
    seat.stop();
  });
});
