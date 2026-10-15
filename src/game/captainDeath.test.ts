import { describe, it, expect } from "vitest";
import { createShipState } from "./economy";
import { hex, hexEquals } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, Mission, NPCShip } from "./types";
import { awaitingCaptain, dealReplacementHand, loseShip, replaceCaptain } from "./captainDeath";

/**
 * Captain death and replacement (#265): a player who loses their ship loses
 * their captain, is dealt a hand on their next turn, and the captain they
 * pick starts again at a home port with a starter ship.
 */

const captain = (id: string, nation: Captain["nation"] = "England"): Captain => ({ id, name: id, nation, ability: "" });

const mission: Mission = {
  id: "m",
  title: "Urgent Cargo",
  description: "Deliver to Port Royal",
  type: "DELIVERY",
  targetPortName: "Port Royal",
  reward: { gold: 30, glory: 1 },
  status: "ACTIVE",
};

/** Water round an English port at (0, 0) docking at (1, 0), and a French one at (4, 0) docking at (3, 0). */
function cells(): MapCell[] {
  const water = [hex(1, 0), hex(1, -1), hex(0, -1), hex(-1, 0), hex(-1, 1), hex(0, 1), hex(2, 0), hex(3, 0), hex(5, 0)];
  return [
    { hex: hex(0, 0), terrain: "island", hasPort: true, nation: "England", portName: "Port Royal", dockingHex: hex(1, 0), elevation: 1 },
    { hex: hex(4, 0), terrain: "island", hasPort: true, nation: "France", portName: "Tortuga", dockingHex: hex(3, 0), elevation: 1 },
    ...water.map((h): MapCell => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 })),
  ];
}

/** Two seats at sea; seat 0 has glory, a stash, cargo, gold, a mission and a pirate record. */
function table(): CaribbeanState {
  const lost = createShipState(hex(2, 0), "Galleon");
  lost.captain = captain("blackbeard");
  lost.score = 4;
  lost.stashedGold = 60;
  lost.gold = 90;
  lost.cargo.Rum = 3;
  lost.bounties.Spain = 30;
  lost.activeMission = mission;
  const rival = createShipState(hex(5, 0), "Sloop");
  rival.captain = captain("surcouf", "France");
  return {
    cells: cells(),
    ships: { "0": lost, "1": rival },
    npcs: {},
    mapSize: "small",
    wrap: null,
    captainDeck: [captain("drake"), captain("morgan"), captain("ducasse", "France")],
    draftHands: { "0": [], "1": [] },
    floatingLoot: [],
    npcIdCounter: 0,
    pirates: { "0": { turn: 3, cause: "sink" } },
    bountyClaims: [{ captorId: "1", pirateId: "0", nation: "France", gold: 10, turn: 2 }],
    movesUsed: 0,
  };
}

describe("loseShip: the captain dies with the ship", () => {
  it("removes the ship and leaves the seat awaiting a new captain", () => {
    const G = table();
    loseShip(G, "0", "sunk");
    expect(G.ships["0"]).toBeUndefined();
    expect(awaitingCaptain(G, "0")).toBe(true);
    expect(awaitingCaptain(G, "1")).toBe(false);
  });

  it("records the dead captain and the cause", () => {
    const G = table();
    loseShip(G, "0", "sunk");
    expect(G.lostShips?.["0"]).toMatchObject({ cause: "sunk", captain: captain("blackbeard") });
  });

  it("deals the player no hand yet: that waits for their next turn", () => {
    const G = table();
    loseShip(G, "0", "sunk");
    expect(G.draftHands["0"]).toEqual([]);
  });

  it("does nothing for a seat with no ship", () => {
    const G = table();
    loseShip(G, "0", "sunk");
    const before = structuredClone(G);
    loseShip(G, "0", "sunk");
    expect(G).toEqual(before);
  });
});

describe("dealReplacementHand: the start of the player's next turn", () => {
  it("deals a seat awaiting a captain two from the top of the deck", () => {
    const G = table();
    loseShip(G, "0", "sunk");
    dealReplacementHand(G, "0");
    expect(G.draftHands["0"]).toEqual([captain("drake"), captain("morgan")]);
    expect(G.captainDeck.map((c) => c.id)).toEqual(["ducasse", "blackbeard"]);
  });

  it("deals nothing to a seat with a ship, nor a second hand", () => {
    const G = table();
    dealReplacementHand(G, "1");
    expect(G.draftHands["1"]).toEqual([]);
    loseShip(G, "0", "sunk");
    dealReplacementHand(G, "0");
    dealReplacementHand(G, "0");
    expect(G.draftHands["0"]).toEqual([captain("drake"), captain("morgan")]);
  });
});

/** Seat 0 lost its ship and was dealt Drake and Morgan; picks `index` with `shipClass`. */
function replaced(index = 0, shipClass: "Sloop" | "Flute" = "Sloop") {
  const G = table();
  loseShip(G, "0", "sunk");
  dealReplacementHand(G, "0");
  const ok = replaceCaptain(G, "0", index, shipClass);
  return { G, ok, ship: G.ships["0"] };
}

describe("replaceCaptain: the pick", () => {
  it("puts the new captain on a starter ship docked at their home port", () => {
    const { ok, ship } = replaced(1, "Flute");
    expect(ok).toBe(true);
    expect(ship.captain).toEqual(captain("morgan"));
    expect(ship.shipClass).toBe("Flute");
    expect(ship.stats?.maneuverability).toBe(2);
    expect(hexEquals(ship.position, hex(1, 0))).toBe(true);
    expect(hexEquals(ship.homePortHex!, hex(0, 0))).toBe(true);
    expect(hexEquals(ship.homeDockingHex!, hex(1, 0))).toBe(true);
  });

  it("keeps the player's glory and stashed gold", () => {
    const { ship } = replaced();
    expect(ship.score).toBe(4);
    expect(ship.stashedGold).toBe(60);
  });

  it("loses the old ship's cargo, carried gold, bounties and mission", () => {
    const { ship } = replaced();
    expect(ship.cargo).toEqual({ Wood: 0, Sugar: 0, Rum: 0, Spice: 0 });
    expect(ship.gold).toBe(createShipState(hex(0, 0)).gold);
    expect(ship.bounties.Spain).toBe(0);
    expect(ship.activeMission).toBeUndefined();
  });

  it("starts the new captain clean: no pirate record, and paid bounties stay paid", () => {
    const { G } = replaced();
    expect(G.pirates?.["0"]).toBeUndefined();
    expect(G.bountyClaims).toEqual([{ captorId: "1", pirateId: "0", nation: "France", gold: 10, turn: 2 }]);
  });

  it("calls off the flotillas hunting the dead captain", () => {
    const G = table();
    G.npcs.hunter = { id: "hunter", huntingTargetId: "0" } as NPCShip;
    loseShip(G, "0", "sunk");
    dealReplacementHand(G, "0");
    replaceCaptain(G, "0", 0, "Sloop");
    expect(G.npcs.hunter.huntingTargetId).toBeNull();
  });

  it("clears the hand and the loss, and returns the captain not picked to the bottom of the deck", () => {
    const { G } = replaced(0);
    expect(G.draftHands["0"]).toEqual([]);
    expect(awaitingCaptain(G, "0")).toBe(false);
    expect(G.lostShips?.["0"]).toBeUndefined();
    expect(G.captainDeck.map((c) => c.id)).toEqual(["ducasse", "blackbeard", "morgan"]);
  });

  it("refuses a seat with a ship, a pick outside the hand, or a ship that is not a starter", () => {
    const G = table();
    expect(replaceCaptain(G, "1", 0, "Sloop")).toBe(false);
    loseShip(G, "0", "sunk");
    expect(replaceCaptain(G, "0", 0, "Sloop")).toBe(false); // no hand dealt yet
    dealReplacementHand(G, "0");
    expect(replaceCaptain(G, "0", 2, "Sloop")).toBe(false);
    expect(replaceCaptain(G, "0", 0, "Galleon" as "Sloop")).toBe(false);
    expect(G.ships["0"]).toBeUndefined();
  });

  it("keeps G JSON-serialisable", () => {
    const { G } = replaced();
    const json = JSON.stringify(G);
    expect(JSON.stringify(JSON.parse(json))).toBe(json);
  });
});
