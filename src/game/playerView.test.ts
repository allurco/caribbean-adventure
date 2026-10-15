import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { Caribbean, withHotseatView } from "./Game";
import { playerViewFor } from "./playerView";
import { createShipState } from "./economy";
import { hex } from "./hex";
import { createNPCShip } from "./npcManager";
import type { Captain, CaribbeanState, Mission } from "./types";

const captain = (id: string): Captain => ({ id, name: id, nation: "England", ability: "" });

/** A two-seat table mid-draft: each seat holds a hand, two captains are left undealt. */
function table(): CaribbeanState {
  return {
    cells: [],
    ships: { "0": createShipState(hex(1, 0), "Sloop"), "1": createShipState(hex(2, -1), "Flute") },
    npcs: {},
    mapSize: "small",
    mapSeed: 7,
    wrap: null,
    captainDeck: [captain("deck-a"), captain("deck-b")],
    draftHands: { "0": [captain("a"), captain("b")], "1": [captain("c"), captain("d")] },
    floatingLoot: [],
    npcIdCounter: 0,
    pirates: {},
    bountyClaims: [],
    movesUsed: 0,
  };
}

describe("playerViewFor: draft hands", () => {
  it("a seat sees its own hand and no other seat's", () => {
    const view = playerViewFor(table(), "0");
    expect(view.draftHands).toEqual({ "0": [captain("a"), captain("b")] });
  });
});

const mission = (id: string): Mission => ({
  id,
  title: "Urgent Cargo",
  description: "Deliver to Port Royal",
  type: "DELIVERY",
  targetPortName: "Port Royal",
  reward: { gold: 30, glory: 1 },
  status: "ACTIVE",
});

describe("playerViewFor: missions", () => {
  it("a seat sees its own mission and not another seat's", () => {
    const G = table();
    G.ships["0"].activeMission = mission("m0");
    G.ships["1"].activeMission = mission("m1");
    const view = playerViewFor(G, "0");
    expect(view.ships["0"].activeMission).toEqual(mission("m0"));
    expect(view.ships["1"]).not.toHaveProperty("activeMission");
  });
});

describe("playerViewFor: the captain deck", () => {
  it("no seat sees the undealt captains or their order", () => {
    expect(playerViewFor(table(), "0").captainDeck).toEqual([]);
    expect(playerViewFor(table(), "1").captainDeck).toEqual([]);
  });
});

const NO_CARGO = { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 };

/** The table with seat 1 carrying goods, gold and a stash. */
function laden(): CaribbeanState {
  const G = table();
  G.ships["1"].cargo = { Wood: 2, Sugar: 0, Rum: 3, Spice: 0 };
  G.ships["1"].gold = 85;
  G.ships["1"].stashedGold = 40;
  return G;
}

describe("playerViewFor: a rival's hold", () => {
  it("hides a rival's cargo and gold until the seat has scouted that ship", () => {
    const view = playerViewFor(laden(), "0");
    expect(view.ships["1"].cargo).toEqual(NO_CARGO);
    expect(view.ships["1"].gold).toBe(0);
  });

  it("shows a rival's cargo and gold once the seat has scouted that ship", () => {
    const G = laden();
    G.ships["0"].scoutedShips = ["1"];
    const view = playerViewFor(G, "0");
    expect(view.ships["1"].cargo).toEqual({ Wood: 2, Sugar: 0, Rum: 3, Spice: 0 });
    expect(view.ships["1"].gold).toBe(85);
  });

  it("never shows a rival's stashed gold, scouted or not", () => {
    const G = laden();
    expect(playerViewFor(G, "0").ships["1"].stashedGold).toBe(0);
    G.ships["0"].scoutedShips = ["1"];
    expect(playerViewFor(G, "0").ships["1"].stashedGold).toBe(0);
  });

  it("shows a seat all of its own ship", () => {
    const view = playerViewFor(laden(), "1");
    expect(view.ships["1"]).toEqual(laden().ships["1"]);
  });
});

/** The table with an unidentified merchant `m1` carrying goods and gold. */
function withMerchant(isIdentified: boolean): CaribbeanState {
  const G = table();
  G.npcs.m1 = {
    ...createNPCShip("m1", hex(3, 0), hex(-3, 0), "Spain", "Flute", () => 0.5),
    cargo: { Wood: 0, Sugar: 4, Rum: 0, Spice: 1 },
    gold: 30,
    isIdentified,
  };
  return G;
}

describe("playerViewFor: NPC holds", () => {
  it("hides an unidentified NPC's cargo and gold, and keeps the rest of it", () => {
    const view = playerViewFor(withMerchant(false), "0");
    expect(view.npcs.m1).toEqual({ ...withMerchant(false).npcs.m1, cargo: NO_CARGO, gold: 0 });
  });

  it("shows an identified NPC's cargo and gold", () => {
    expect(playerViewFor(withMerchant(true), "0").npcs.m1).toEqual(withMerchant(true).npcs.m1);
  });
});

/** A table with something private everywhere: hands, deck, missions, holds, stashes, an unidentified merchant. */
function secretive(): CaribbeanState {
  const G = withMerchant(false);
  for (const id of ["0", "1"]) {
    G.ships[id].activeMission = mission(`m${id}`);
    G.ships[id].cargo = { Wood: 1, Sugar: 1, Rum: 1, Spice: 1 };
    G.ships[id].gold = 50;
    G.ships[id].stashedGold = 20;
  }
  G.ships["0"].scoutedShips = ["1"];
  return G;
}

describe("playerViewFor: a spectator (no seat)", () => {
  for (const playerID of [null, undefined]) {
    it(`sees no private information (playerID ${playerID})`, () => {
      const view = playerViewFor(secretive(), playerID);
      expect(view.draftHands).toEqual({});
      expect(view.captainDeck).toEqual([]);
      expect(view.npcs.m1.cargo).toEqual(NO_CARGO);
      expect(view.npcs.m1.gold).toBe(0);
      for (const ship of Object.values(view.ships)) {
        expect(ship).not.toHaveProperty("activeMission");
        expect(ship.cargo).toEqual(NO_CARGO);
        expect(ship.gold).toBe(0);
        expect(ship.stashedGold).toBe(0);
      }
    });
  }
});

describe("playerViewFor: what stays public", () => {
  it("keeps the board everyone sees: map, positions, captains, damage, glory, bounties, combat, pirates", () => {
    const G = secretive();
    G.ships["1"].captain = captain("c");
    G.ships["1"].damage = { hull: 1, crew: 0, masts: 1 };
    G.ships["1"].score = 4;
    G.ships["1"].bounties.Spain = 2;
    G.pirates = { "1": { turn: 3, cause: "sink" } };
    G.combat = {
      attackerId: "1", defenderId: "m1", round: 1, stage: "cannons", seamanshipWinner: "1",
      seamanshipRolls: { "1": 5, m1: 2 }, actionChosen: "fire", attackerHits: 1, defenderHits: 0,
      distance: 1, isNPCCombat: true, fleeOutcome: null, fleeRolls: null,
    };
    const view = playerViewFor(G, "0");
    // Seat 0 has scouted seat 1, so only the mission and the stash are hidden.
    expect(view.ships["1"]).toEqual({ ...G.ships["1"], activeMission: undefined, stashedGold: 0 });
    expect(view.ships["1"]).not.toHaveProperty("activeMission");
    expect({ ...view, ships: {}, npcs: {} }).toEqual({
      ...G,
      ships: {},
      npcs: {},
      captainDeck: [],
      draftHands: { "0": G.draftHands["0"] },
    });
  });

  it("leaves the match state it was given untouched", () => {
    const G = secretive();
    playerViewFor(G, "0");
    playerViewFor(G, null);
    expect(G).toEqual(secretive());
  });

  it("stays JSON-serialisable", () => {
    for (const playerID of ["0", "1", null]) {
      const view = playerViewFor(secretive(), playerID);
      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    }
  });
});

describe("the Caribbean game's playerView", () => {
  /** The game, starting on the secretive table instead of a generated map. */
  const onTable: Game<CaribbeanState> = { ...Caribbean, setup: () => secretive() };

  it("gives a seated client only its own seat's view", () => {
    const client = Client<CaribbeanState>({ game: onTable, numPlayers: 2, playerID: "1" });
    expect(client.getState()!.G).toEqual(playerViewFor(secretive(), "1"));
  });

  it("gives a client with no seat the spectator's view", () => {
    const client = Client<CaribbeanState>({ game: onTable, numPlayers: 2 });
    expect(client.getState()!.G).toEqual(playerViewFor(secretive(), null));
  });

  it("hotseat: one shared screen with no seat sees the whole table", () => {
    const client = Client<CaribbeanState>({ game: withHotseatView(onTable), numPlayers: 2 });
    expect(client.getState()!.G).toEqual(secretive());
  });
});

describe("playerViewFor: a seat that lost its ship (#265)", () => {
  /** Seat 1's ship is lost and its turn dealt it a replacement hand. */
  function lostTable(): CaribbeanState {
    const G = table();
    G.draftHands = { "0": [], "1": [captain("e"), captain("f")] };
    delete G.ships["1"];
    G.lostShips = { "1": { cause: "sunk", captain: captain("dead"), score: 2, stashedGold: 40 } };
    return G;
  }

  it("shows the replacement hand only to its own seat", () => {
    expect(playerViewFor(lostTable(), "1").draftHands).toEqual({ "1": [captain("e"), captain("f")] });
    expect(playerViewFor(lostTable(), "0").draftHands).toEqual({ "0": [] });
    expect(playerViewFor(lostTable(), null).draftHands).toEqual({});
  });

  it("hides the stash it keeps from other seats, but not its glory or the dead captain", () => {
    expect(playerViewFor(lostTable(), "1").lostShips).toEqual(lostTable().lostShips);
    expect(playerViewFor(lostTable(), "0").lostShips).toEqual({
      "1": { cause: "sunk", captain: captain("dead"), score: 2, stashedGold: 0 },
    });
  });
});
