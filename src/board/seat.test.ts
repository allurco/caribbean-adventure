import { describe, expect, it } from "vitest";
import { Client } from "boardgame.io/client";
import { Local } from "boardgame.io/multiplayer";
import type { Game } from "boardgame.io";
import { Caribbean } from "../game/Game";
import { createShipState, STARTING_GOLD } from "../game/economy";
import { hex } from "../game/hex";
import { createNPCShip } from "../game/npcManager";
import type { Captain, CaribbeanState, CombatState, FleeOutcome, NPCShip } from "../game/types";
import { choosingCaptain, combatWaitingFor, draftView, fightBystander, fightWatched, gloryScoreboard, hudSeat, hudShip, isHotseatBoard, viewerSeat, seatMayAct, seatMayActInCombat, seatName, turnCaptainName, waitingFor } from "./seat";
import { startHandoff } from "./turnHandoff";

const npc = (id: string): NPCShip => createNPCShip(id, hex(5, 0), hex(6, 0), "Spain", "Flute", () => 0.5);

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

describe("isHotseatBoard: the seatless board several captains share", () => {
  it("no seat and more than one captain; never a seat's own board or a solo game", () => {
    expect(isHotseatBoard(undefined, 2)).toBe(true);
    expect(isHotseatBoard(null, 4)).toBe(true);
    expect(isHotseatBoard(undefined, 1)).toBe(false);
    expect(isHotseatBoard("1", 2)).toBe(false);
  });
});

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

describe("turnCaptainName: whose turn a log row came on (#372)", () => {
  it("the seat's captain while it has a ship", () => {
    const G = table(2);
    G.ships["1"].captain = captain("x", "Anne Bonny");
    expect(turnCaptainName(G, "1")).toBe("Anne Bonny");
  });
  it("the captain who went down with the ship, once it is lost", () => {
    const G = table(2);
    delete G.ships["1"];
    G.lostShips = { "1": { cause: "sunk", captain: captain("x", "Anne Bonny"), score: 0, stashedGold: 0 } };
    expect(turnCaptainName(G, "1")).toBe("Anne Bonny");
  });
  it("'Player n' with no captain to name", () => {
    const G = table(2);
    delete G.ships["1"];
    expect(turnCaptainName(G, "1")).toBe("Player 2");
  });
  it("'Player n' for a lost ship that kept no captain", () => {
    const G = table(2);
    delete G.ships["1"];
    G.lostShips = { "1": { cause: "sunk", score: 0, stashedGold: 0 } };
    expect(turnCaptainName(G, "1")).toBe("Player 2");
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
  const views = (clients: ReturnType<typeof localSeats>) =>
    clients.map((c) => {
      const { G, ctx } = c.getState()!;
      return draftView(G, { playerID: c.playerID, currentPlayer: ctx.currentPlayer });
    });

  for (const seats of [2, 3, 4]) {
    it(`with ${seats} seats on one page, every seat picks from its own hand at once and sees every other still choosing`, () => {
      const clients = localSeats(seats);
      views(clients).forEach((view, i) => {
        expect(view).toEqual({
          kind: "pick",
          hand: [captain(`${i}a`), captain(`${i}b`)],
          passDevice: false,
          // Never another seat's hand, which reaches it emptied (playerView, #109)
          others: clients.filter((_, j) => j !== i).map((_, k) => {
            const seat = k < i ? k : k + 1;
            return { seat: String(seat), name: `Player ${seat + 1}`, picked: false };
          }),
        });
      });
      clients.forEach((c) => c.stop());
    });
  }

  it("a seat that has picked waits on the seats still choosing, each shown picked or still choosing", () => {
    const clients = localSeats(3);
    clients[2].moves.pickCaptain(1, "Sloop");
    const [anne, jack, mary] = views(clients);
    expect(mary).toEqual({
      kind: "waiting",
      line: "Waiting for Player 1 and Player 2 to choose their captains",
      others: [
        { seat: "0", name: "Player 1", picked: false },
        { seat: "1", name: "Player 2", picked: false },
      ],
    });
    expect(anne).toMatchObject({ kind: "pick", others: [{ seat: "1", picked: false }, { seat: "2", name: "Player 3", picked: true }] });
    expect(jack).toMatchObject({ kind: "pick", others: [{ seat: "0", picked: false }, { seat: "2", name: "Player 3", picked: true }] });

    clients[0].moves.pickCaptain(0, "Sloop");
    expect(views(clients)[0]).toEqual({
      kind: "waiting",
      line: "Waiting for Player 2 to choose a captain",
      others: [
        { seat: "1", name: "Player 2", picked: false },
        { seat: "2", name: "Player 3", picked: true },
      ],
    });
    clients.forEach((c) => c.stop());
  });

  it("never names another seat's captain while the draft is on, even from the whole table (#111)", () => {
    const G = table(2);
    G.ships["1"] = { ...G.ships["1"], captain: captain("1a", "Blackbeard"), shipClass: "Flute" };
    const view = draftView(G, { playerID: "0", currentPlayer: "0" });
    expect(view).toMatchObject({ kind: "pick", others: [{ seat: "1", name: "Player 2", picked: true }] });
    expect(JSON.stringify(view)).not.toContain("Blackbeard");
  });

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

describe("hudShip: the ship the HUD shows, or none when the seat's ship is gone", () => {
  it("is the HUD seat's own ship", () => {
    const G = table(3);
    expect(hudShip(G, "2")).toBe(G.ships["2"]);
  });

  for (const seats of [2, 3, 4]) {
    it(`with ${seats} seats, a seat whose ship sank sees no ship on a rival's turn, never the rival's emptied one`, () => {
      const clients = drafted(seats);
      // Seat 1's ship goes down, as a lost fight deletes it from G.ships
      const lost = (G: CaribbeanState) => {
        const ships = { ...G.ships };
        delete ships["1"];
        return { ...G, ships };
      };
      const { G, ctx } = clients[1].getState()!;
      expect(ctx.currentPlayer).toBe("0");
      const seat = hudSeat({ playerID: "1", currentPlayer: ctx.currentPlayer, handoff: null, ships: lost(G).ships });
      expect(seat).toBe("1");
      expect(hudShip(lost(G), seat)).toBeNull();
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
      { seat: "1", name: "Player 2", glory: 7, viewer: false, out: false },
      { seat: "2", name: "Player 3", glory: 3, viewer: true, out: false },
      { seat: "3", name: "Calico Jack", glory: 3, viewer: false, out: false },
      { seat: "0", name: "Anne Bonny", glory: 0, viewer: false, out: false },
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

  it("marks which seats are online in an online match (#114), and says nothing of it in hotseat or solo", () => {
    const G = table(3);
    G.ships["1"].score = 2;
    expect(gloryScoreboard(G, "0", ["0", "1"]).map(({ seat, online }) => ({ seat, online }))).toEqual([
      { seat: "1", online: true },
      { seat: "0", online: true },
      { seat: "2", online: false },
    ]);
    for (const unknown of [undefined, null]) {
      for (const row of gloryScoreboard(G, "0", unknown)) expect(row).not.toHaveProperty("online");
    }
  });
});

describe("seatMayActInCombat: who presses each step of a fight", () => {
  type Step = CombatState["stage"];
  const fight = (stage: Step, seamanshipWinner: string | null, isNPCCombat = false, fleeOutcome: FleeOutcome = null) => ({
    attackerId: "0",
    defenderId: isNPCCombat ? "npc-1" : "1",
    isNPCCombat,
    stage,
    seamanshipWinner,
    fleeOutcome,
  });
  const presses = (combat: ReturnType<typeof fight>) =>
    ["0", "1", "2"].filter((playerID) => seatMayActInCombat({ playerID, combat }));

  it("hotseat: the one shared screen presses every step", () => {
    for (const stage of ["seamanship", "chooseAction", "fleeAttempt", "cannons", "resolution"] as const) {
      expect(seatMayActInCombat({ playerID: null, combat: fight(stage, "1") })).toBe(true);
    }
  });

  it("the attacker rolls the draw (both dice); the defender and bystanders watch", () => {
    expect(presses(fight("seamanship", null))).toEqual(["0"]);
  });

  it("the faster ship, the draw's winner, presses the action and every roll after it", () => {
    for (const stage of ["chooseAction", "fleeAttempt", "cannons"] as const) {
      expect(presses(fight(stage, "1"))).toEqual(["1"]);
      expect(presses(fight(stage, "0"))).toEqual(["0"]);
    }
  });

  it("a flight caught: the pursuer fires the parting shot, not the ship that fled", () => {
    // The attacker fled and was caught: the defender fires
    expect(presses(fight("cannons", "0", false, "caught"))).toEqual(["1"]);
    // The defender fled and was caught: the attacker fires
    expect(presses(fight("cannons", "1", false, "caught"))).toEqual(["0"]);
  });

  it("the legacy resolution (a fight stored before #380): either captain of the fight, never a bystander", () => {
    for (const winner of ["0", "1", null]) {
      expect(presses(fight("resolution", winner))).toEqual(["0", "1"]);
      expect(presses(fight("resolution", winner, false, "caught"))).toEqual(["0", "1"]);
    }
  });

  it("against an NPC the attacker presses every step, even when the NPC wins the draw", () => {
    for (const stage of ["seamanship", "chooseAction", "fleeAttempt", "cannons", "resolution"] as const) {
      expect(presses(fight(stage, "npc-1", true))).toEqual(["0"]);
      expect(presses(fight(stage, "0", true))).toEqual(["0"]);
    }
  });
});

describe("combatWaitingFor: the line a seat sees while another seat presses", () => {
  const G = table(3);
  G.ships["0"].captain = captain("a", "Anne Bonny");
  G.ships["1"].captain = captain("b", "Calico Jack");
  const pvp = { attackerId: "0", defenderId: "1", isNPCCombat: false, fleeOutcome: null };

  it("names who it waits on and for what", () => {
    expect(combatWaitingFor(G, { playerID: "1", combat: { ...pvp, stage: "seamanship", seamanshipWinner: null } })).toBe(
      "Waiting for Anne Bonny to roll for seamanship"
    );
    // From round 2 each captain rolls its own die (#347): the attacker has rolled, the defender rolls next
    expect(combatWaitingFor(G, { playerID: "0", combat: { ...pvp, stage: "defenderSeamanship", seamanshipWinner: null } })).toBe(
      "Waiting for Calico Jack to roll for seamanship"
    );
    expect(combatWaitingFor(G, { playerID: "2", combat: { ...pvp, stage: "defenderSeamanship", seamanshipWinner: null } })).toBe(
      "Waiting for Calico Jack to roll for seamanship"
    );
    expect(combatWaitingFor(G, { playerID: "1", combat: { ...pvp, stage: "defenderSeamanship", seamanshipWinner: null } })).toBeNull();
    expect(combatWaitingFor(G, { playerID: "0", combat: { ...pvp, stage: "chooseAction", seamanshipWinner: "1" } })).toBe(
      "Waiting for Calico Jack to choose"
    );
    expect(combatWaitingFor(G, { playerID: "2", combat: { ...pvp, stage: "cannons", seamanshipWinner: "1" } })).toBe(
      "Waiting for Calico Jack to fire"
    );
    // Round 1, the ambush (#346): no draw, and the attacker fires
    expect(combatWaitingFor(G, { playerID: "1", combat: { ...pvp, stage: "cannons", seamanshipWinner: null } })).toBe(
      "Waiting for Anne Bonny to fire"
    );
    // A bystander waits on the legacy resolution, which either captain may press (#380)
    expect(combatWaitingFor(G, { playerID: "2", combat: { ...pvp, stage: "resolution", seamanshipWinner: null } })).toBe(
      "Waiting for Anne Bonny to end the round"
    );
    // The answer is the other ship's own step (#348): the ambush fired, Calico Jack answers
    expect(combatWaitingFor(G, { playerID: "0", combat: { ...pvp, stage: "returnFire", seamanshipWinner: null } })).toBe(
      "Waiting for Calico Jack to fire"
    );
    expect(combatWaitingFor(G, { playerID: "1", combat: { ...pvp, stage: "returnFire", seamanshipWinner: null } })).toBeNull();
    // Calico Jack won the draw and fired: Anne Bonny answers
    expect(combatWaitingFor(G, { playerID: "2", combat: { ...pvp, stage: "returnFire", seamanshipWinner: "1" } })).toBe(
      "Waiting for Anne Bonny to fire"
    );
    // Calico Jack fled and was caught: Anne Bonny fires the parting shot
    expect(combatWaitingFor(G, { playerID: "1", combat: { ...pvp, stage: "cannons", seamanshipWinner: "1", fleeOutcome: "caught" } })).toBe(
      "Waiting for Anne Bonny to fire"
    );
  });

  it("is nothing for the seat that presses, and nothing in hotseat", () => {
    expect(combatWaitingFor(G, { playerID: "1", combat: { ...pvp, stage: "resolution", seamanshipWinner: "1" } })).toBeNull();
    expect(combatWaitingFor(G, { playerID: null, combat: { ...pvp, stage: "resolution", seamanshipWinner: "1" } })).toBeNull();
  });
});

describe("fightBystander: a seat with no ship in the fight, which sees who is fighting whom", () => {
  it("is a seat neither attacking nor attacked; never a combatant, never hotseat", () => {
    const pvp = { attackerId: "0", defenderId: "1", isNPCCombat: false, fleeOutcome: null };
    expect(fightBystander("2", pvp)).toBe(true);
    expect(fightBystander("0", pvp)).toBe(false);
    expect(fightBystander("1", pvp)).toBe(false);
    expect(fightBystander(null, pvp)).toBe(false);
    expect(fightBystander("1", { attackerId: "0", defenderId: "npc-1", isNPCCombat: true })).toBe(true);
  });
});

describe("fightWatched: the line a bystander seat sees over someone else's fight", () => {
  it("names both sides by captain", () => {
    const G = table(3);
    G.ships["0"].captain = captain("a", "Anne Bonny");
    expect(fightWatched(G, { attackerId: "0", defenderId: "1", isNPCCombat: false })).toBe("Anne Bonny is fighting Player 2");
  });

  it("names an NPC as the combat panel does: merchant or flotilla, and its nation", () => {
    const G = table(2);
    G.npcs["npc-4"] = { ...npc("npc-4"), role: "FLOTILLA", nation: "Spain" };
    G.npcs["npc-5"] = { ...npc("npc-5"), role: "MERCHANT", nation: "England" };
    expect(fightWatched(G, { attackerId: "1", defenderId: "npc-4", isNPCCombat: true })).toBe("Player 2 is fighting a Spanish flotilla");
    expect(fightWatched(G, { attackerId: "0", defenderId: "npc-5", isNPCCombat: true })).toBe("Player 1 is fighting an English merchant");
  });
});

describe("viewerSeat: whose ship the board treats as 'yours' (hover, details, port, scouting)", () => {
  it("is the client's seat, or in hotseat the current player's", () => {
    expect(viewerSeat({ playerID: "2", currentPlayer: "0" })).toBe("2");
    expect(viewerSeat({ playerID: null, currentPlayer: "3" })).toBe("3");
  });
});

/** A two-seat table in the main phase where seat 1 lost its ship (#265) and its turn dealt it a hand. */
function lostSeatTable(): CaribbeanState {
  const G = table(2);
  G.ships["0"].captain = captain("a", "Anne Bonny");
  delete G.ships["1"];
  G.draftHands = { "0": [], "1": [captain("e"), captain("f")] };
  G.lostShips = { "1": { cause: "sunk", captain: captain("dead"), score: 5, stashedGold: 30 } };
  return G;
}

describe("choosingCaptain: when the captain screen is up", () => {
  it("through the draft, and in the main phase while the current seat awaits a new captain (#265)", () => {
    const G = lostSeatTable();
    expect(choosingCaptain(G, "draft", "0")).toBe(true);
    expect(choosingCaptain(G, "main", "1")).toBe(true);
    expect(choosingCaptain(G, "main", "0")).toBe(false);
    expect(choosingCaptain(G, "combat", "1")).toBe(false);
  });

  it("never for a seat out of the game", () => {
    const G = lostSeatTable();
    G.lostShips!["1"].eliminated = true;
    expect(choosingCaptain(G, "main", "1")).toBe(false);
  });
});

describe("draftView: a new captain for a lost ship (#265)", () => {
  it("the seat picks from its hand without passing the device, even in hotseat", () => {
    const G = lostSeatTable();
    const view = { kind: "pick", hand: [captain("e"), captain("f")], passDevice: false };
    expect(draftView(G, { playerID: null, currentPlayer: "1" })).toEqual(view);
    expect(draftView(G, { playerID: "1", currentPlayer: "1" })).toEqual(view);
  });

  it("every other seat waits for it to pick a new captain", () => {
    expect(draftView(lostSeatTable(), { playerID: "0", currentPlayer: "1" })).toEqual({
      kind: "waiting",
      line: "Waiting for Player 2 to pick a new captain",
    });
  });
});

describe("gloryScoreboard: a seat that lost its ship (#265)", () => {
  it("keeps its glory on the board while it waits for a new captain", () => {
    expect(gloryScoreboard(lostSeatTable(), "0")).toEqual([
      { seat: "1", name: "Player 2", glory: 5, viewer: false, out: false },
      { seat: "0", name: "Anne Bonny", glory: 0, viewer: true, out: false },
    ]);
  });

  it("marks a seat out of the game, keeping its glory", () => {
    const G = lostSeatTable();
    G.lostShips!["1"].eliminated = true;
    expect(gloryScoreboard(G, "0")[0]).toEqual({ seat: "1", name: "Player 2", glory: 5, viewer: false, out: true });
  });
});
