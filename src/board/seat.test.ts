import { describe, expect, it } from "vitest";
import { Client } from "boardgame.io/client";
import { Local } from "boardgame.io/multiplayer";
import type { Game } from "boardgame.io";
import { Caribbean } from "../game/Game";
import { createShipState, STARTING_GOLD } from "../game/economy";
import { hex } from "../game/hex";
import type { Captain, CaribbeanState } from "../game/types";
import { draftView, fightWatched, gloryScoreboard, hudSeat, ownSeat, seatMayAct, seatMayActInCombat, seatName, waitingFor } from "./seat";
import { startHandoff } from "./turnHandoff";

const captain = (id: string, name = `Captain ${id}`): Captain => ({ id, name, nation: "Spain", ability: "-" });

/** A table of `seats` seats (2 to 4) still in the draft, each dealt two captains. */
function table(seats: number): CaribbeanState {
  const ships: CaribbeanState["ships"] = {};
  const draftHands: CaribbeanState["draftHands"] = {};
  for (let i = 0; i < seats; i++) {
    ships[String(i)] = createShipState(hex(i, 0));
    draftHands[String(i)] = [captain(`${i}a`), captain(`${i}b`)];
  }
  return {
    cells: [],
    ships,
    npcs: {},
    mapSize: "small",
    wrap: null,
    captainDeck: [],
    draftHands,
    floatingLoot: [],
    npcIdCounter: 0,
  };
}

/** Every seat of a `seats`-seat match on one page, through boardgame.io's local transport. */
function localSeats(seats: number) {
  const game: Game<CaribbeanState> = { ...Caribbean, setup: () => table(seats) };
  const multiplayer = Local();
  const clients = Array.from({ length: seats }, (_, i) => {
    const client = Client<CaribbeanState>({ game, numPlayers: seats, playerID: String(i), multiplayer });
    client.start();
    return client;
  });
  return clients;
}

describe("seatMayAct", () => {
  it("hotseat (no seat): the one shared screen may always act", () => {
    expect(seatMayAct({ playerID: null, currentPlayer: "0" })).toBe(true);
    expect(seatMayAct({ playerID: undefined, currentPlayer: "3" })).toBe(true);
  });

  for (const seats of [2, 3, 4]) {
    it(`with ${seats} seats on one page, only the seat whose turn it is may act`, () => {
      const clients = localSeats(seats);
      const turn = clients.map((c) => seatMayAct({ playerID: c.playerID, currentPlayer: c.getState()!.ctx.currentPlayer }));
      expect(turn).toEqual(clients.map((_, i) => i === 0));
      clients.forEach((c) => c.stop());
    });
  }
});

describe("hudSeat: whose ship, gold and hand the HUD shows", () => {
  const ships = table(4).ships;

  it("a seat always sees its own, on its turn and on every rival's", () => {
    for (const currentPlayer of ["0", "1", "2", "3"]) {
      expect(hudSeat({ playerID: "2", currentPlayer, handoff: null, ships })).toBe("2");
    }
    const handoff = { ...startHandoff("1", "3", 0, false), phase: "turnEnded" as const };
    expect(hudSeat({ playerID: "2", currentPlayer: "3", handoff, ships })).toBe("2");
  });

  it("hotseat: the current player's, or the outgoing captain's until the next turn is announced (#216)", () => {
    expect(hudSeat({ playerID: null, currentPlayer: "1", handoff: null, ships })).toBe("1");
    const ending = { ...startHandoff("0", "1", 0, false), phase: "turnEnded" as const };
    expect(hudSeat({ playerID: null, currentPlayer: "1", handoff: ending, ships })).toBe("0");
    expect(hudSeat({ playerID: null, currentPlayer: "1", handoff: { ...ending, phase: "nextTurn" }, ships })).toBe("1");
    expect(hudSeat({ playerID: null, currentPlayer: "1", handoff: { ...ending, phase: "idle" }, ships })).toBe("1");
    // The outgoing ship was sunk: the current player's
    expect(hudSeat({ playerID: null, currentPlayer: "1", handoff: { ...ending, from: "9" }, ships })).toBe("1");
  });
});

describe("seatName", () => {
  it("is the seat's captain, or 'Player n' (counting from 1) before the draft gives it one", () => {
    const G = table(3);
    G.ships["1"].captain = captain("x", "Anne Bonny");
    expect(seatName(G, "1")).toBe("Anne Bonny");
    expect(seatName(G, "2")).toBe("Player 3");
  });
});

describe("waitingFor: the line a seat sees on another's turn", () => {
  it("names whoever's turn it is, by captain", () => {
    const G = table(4);
    G.ships["3"].captain = captain("x", "Calico Jack");
    expect(waitingFor(G, { playerID: "0", currentPlayer: "3" })).toBe("Waiting for Calico Jack");
  });

  it("is nothing on the seat's own turn, and nothing in hotseat", () => {
    const G = table(2);
    expect(waitingFor(G, { playerID: "1", currentPlayer: "1" })).toBeNull();
    expect(waitingFor(G, { playerID: null, currentPlayer: "1" })).toBeNull();
  });
});

describe("draftView: what the draft screen shows a seat", () => {
  for (const seats of [2, 3, 4]) {
    it(`with ${seats} seats on one page, the drafting seat picks from its hand and every other waits for it`, () => {
      const clients = localSeats(seats);
      for (let turn = 0; turn < seats; turn++) {
        const views = clients.map((c) => {
          const { G, ctx } = c.getState()!;
          return draftView(G, { playerID: c.playerID, currentPlayer: ctx.currentPlayer });
        });
        views.forEach((view, i) => {
          if (i === turn) {
            expect(view).toEqual({ kind: "pick", hand: [captain(`${i}a`), captain(`${i}b`)], passDevice: false });
          } else {
            // Never another seat's hand, which reaches it emptied (playerView, #109)
            expect(view).toEqual({ kind: "waiting", line: `Waiting for Player ${turn + 1} to draft` });
          }
        });
        clients[turn].moves.pickCaptain(0, "Sloop");
      }
      clients.forEach((c) => c.stop());
    });
  }

  it("hotseat: the current player picks from their hand, then passes the device", () => {
    const G = table(3);
    expect(draftView(G, { playerID: null, currentPlayer: "1" })).toEqual({
      kind: "pick",
      hand: G.draftHands["1"],
      passDevice: true,
    });
  });

  it("hotseat with an empty hand waits, as before", () => {
    const G = table(2);
    G.draftHands["0"] = [];
    expect(draftView(G, { playerID: null, currentPlayer: "0" })).toEqual({
      kind: "waiting",
      line: "Waiting for other players...",
    });
  });
});

/** Every seat drafted (seat i its first captain), so the match is in its main phase on seat 0's turn. */
function drafted(seats: number) {
  const clients = localSeats(seats);
  for (const client of clients) client.moves.pickCaptain(0, "Sloop");
  return clients;
}

describe("no zeros for rivals: a seat's HUD on another seat's turn", () => {
  for (const seats of [2, 3, 4]) {
    it(`with ${seats} seats, every waiting seat's HUD shows its own purse, never a rival's emptied one`, () => {
      const clients = drafted(seats);
      clients[0].events.endTurn!();
      for (const client of clients) {
        const { G, ctx } = client.getState()!;
        expect(ctx.phase).toBe("main");
        expect(ctx.currentPlayer).toBe("1");
        const shown = hudSeat({ playerID: client.playerID, currentPlayer: ctx.currentPlayer, handoff: null, ships: G.ships });
        expect(shown).toBe(client.playerID);
        expect(G.ships[shown].gold).toBe(STARTING_GOLD);
      }
      // What the HUD avoids: the current player's ship as a waiting seat sees it
      expect(clients[0].getState()!.G.ships["1"].gold).toBe(0);
      clients.forEach((c) => c.stop());
    });
  }
});

describe("gloryScoreboard: every seat's captain and glory, which is public", () => {
  it("lists every seat, most glory first (ties in seat order), marking the viewer's", () => {
    const G = table(4);
    G.ships["0"].captain = captain("a", "Anne Bonny");
    G.ships["1"].score = 7;
    G.ships["2"].score = 3;
    G.ships["3"].score = 3;
    G.ships["3"].captain = captain("d", "Calico Jack");
    expect(gloryScoreboard(G, "2")).toEqual([
      { seat: "1", name: "Player 2", glory: 7, viewer: false },
      { seat: "2", name: "Player 3", glory: 3, viewer: true },
      { seat: "3", name: "Calico Jack", glory: 3, viewer: false },
      { seat: "0", name: "Anne Bonny", glory: 0, viewer: false },
    ]);
  });

  it("is the same glory for every seat on one page", () => {
    const clients = drafted(3);
    const boards = clients.map((c) => gloryScoreboard(c.getState()!.G, c.playerID!).map(({ seat, glory }) => ({ seat, glory })));
    expect(boards[1]).toEqual(boards[0]);
    expect(boards[2]).toEqual(boards[0]);
    expect(boards[0]).toHaveLength(3);
    clients.forEach((c) => c.stop());
  });
});

describe("seatMayActInCombat", () => {
  const combat = (attackerId: string, defenderId: string, isNPCCombat: boolean) => ({ attackerId, defenderId, isNPCCombat });

  it("hotseat: always", () => {
    expect(seatMayActInCombat(null, combat("0", "1", false))).toBe(true);
  });

  it("a seat acts in its own fight, attacking or attacked; a bystander watches", () => {
    expect(seatMayActInCombat("0", combat("0", "1", false))).toBe(true);
    expect(seatMayActInCombat("1", combat("0", "1", false))).toBe(true);
    expect(seatMayActInCombat("2", combat("0", "1", false))).toBe(false);
    expect(seatMayActInCombat("0", combat("0", "npc-1", true))).toBe(true);
    expect(seatMayActInCombat("1", combat("0", "npc-1", true))).toBe(false);
  });
});

describe("fightWatched: the line a bystander seat sees over someone else's fight", () => {
  it("names both sides by captain, an NPC as a merchant", () => {
    const G = table(3);
    G.ships["0"].captain = captain("a", "Anne Bonny");
    expect(fightWatched(G, { attackerId: "0", defenderId: "1", isNPCCombat: false })).toBe("Anne Bonny is fighting Player 2");
    expect(fightWatched(G, { attackerId: "1", defenderId: "npc-4", isNPCCombat: true })).toBe("Player 2 is fighting a merchant");
  });
});

describe("ownSeat: whose ship the board treats as 'yours' (hover, details, port, scouting)", () => {
  it("is the client's seat, or in hotseat the current player's", () => {
    expect(ownSeat({ playerID: "2", currentPlayer: "0" })).toBe("2");
    expect(ownSeat({ playerID: null, currentPlayer: "3" })).toBe("3");
  });
});
