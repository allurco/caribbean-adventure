import { describe, it, expect } from "vitest";
import { soundEventsFrom } from "./soundEvents";
import type { CaribbeanState, CombatState, MapCell, NPCShip, ShipState } from "../game/types";
import { hex } from "../game/hex";
import { emptyCargo } from "../game/economy";
import { SHIP_SPECS } from "../game/constants";

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    position: hex(0, 0),
    cargo: emptyCargo(),
    gold: 100,
    maxCargo: 10,
    upgrades: [],
    damage: { hull: 0, crew: 0, masts: 0 },
    bounties: { England: 0, France: 0, Spain: 0, Netherlands: 0 },
    score: 0,
    stashedGold: 0,
    scoutedShips: [],
    shipClass: "Sloop",
    ...overrides,
  };
}

function makeNpc(overrides: Partial<NPCShip> = {}): NPCShip {
  return {
    id: "npc-1",
    position: hex(5, 5),
    cargo: emptyCargo(),
    gold: 20,
    shipClass: "Flute",
    stats: { ...SHIP_SPECS.Flute, crew: { ...SHIP_SPECS.Flute.crew }, hull: { ...SHIP_SPECS.Flute.hull } },
    damage: { hull: 0, crew: 0, masts: 0 },
    nation: "Spain",
    aiBehavior: "MERCHANT_ROUTE",
    destinationPortHex: hex(9, 9),
    spawnPortHex: hex(1, 1),
    isIdentified: false,
    bounty: 1,
    role: "MERCHANT",
    huntingTargetId: null,
    ...overrides,
  };
}

const PORT: MapCell = {
  hex: hex(3, 0),
  terrain: "island",
  hasPort: true,
  portName: "Port Royal",
  dockingHex: hex(2, 0),
  elevation: 1,
};

function makeState(overrides: Partial<CaribbeanState> = {}): CaribbeanState {
  return {
    cells: [PORT],
    ships: { "0": makeShip(), "1": makeShip({ position: hex(4, 4) }) },
    npcs: {},
    mapSize: "small",
    wrap: null,
    captainDeck: [],
    draftHands: {},
    floatingLoot: [],
    npcIdCounter: 0,
    ...overrides,
  };
}

function makeCombat(overrides: Partial<CombatState> = {}): CombatState {
  return {
    attackerId: "0",
    defenderId: "1",
    round: 1,
    stage: "seamanship",
    seamanshipWinner: null,
    seamanshipRolls: {},
    actionChosen: null,
    attackerHits: 0,
    defenderHits: 0,
    distance: 1,
    isNPCCombat: false,
    fleeOutcome: null,
    fleeRolls: null,
    ...overrides,
  };
}

/** `prev` with ship `id` replaced by `ship`. */
function withShip(state: CaribbeanState, id: string, ship: Partial<ShipState>): CaribbeanState {
  return { ...state, ships: { ...state.ships, [id]: { ...state.ships[id], ...ship } } };
}

describe("soundEventsFrom", () => {
  it("emits nothing for the first state or an unchanged one", () => {
    const state = makeState();
    expect(soundEventsFrom(undefined, state)).toEqual([]);
    expect(soundEventsFrom(state, state)).toEqual([]);
    expect(soundEventsFrom(state, structuredClone(state))).toEqual([]);
  });

  it("emits a sail when a player's ship changes hex", () => {
    const prev = makeState();
    const next = withShip(prev, "0", { position: hex(1, 0) });
    expect(soundEventsFrom(prev, next)).toEqual([{ type: "shipSailed", shipId: "0" }]);
  });

  it("emits a dock as well when the new hex is a port's docking hex", () => {
    const prev = makeState();
    const next = withShip(prev, "0", { position: hex(2, 0) });
    expect(soundEventsFrom(prev, next)).toEqual([
      { type: "shipSailed", shipId: "0" },
      { type: "docked", shipId: "0", portName: "Port Royal" },
    ]);
  });

  it("emits an NPC sail for each NPC that changes hex", () => {
    const prev = makeState({ npcs: { "npc-1": makeNpc() } });
    const next = makeState({ npcs: { "npc-1": makeNpc({ position: hex(6, 5) }) } });
    expect(soundEventsFrom(prev, next)).toEqual([{ type: "npcSailed", npcId: "npc-1" }]);
  });

  it("emits a purchase when cargo rises and gold falls in port", () => {
    const prev = makeState();
    const next = withShip(prev, "0", { cargo: { ...emptyCargo(), Rum: 2 }, gold: 40 });
    expect(soundEventsFrom(prev, next)).toEqual([{ type: "goodsBought", shipId: "0", good: "Rum", amount: 2 }]);
  });

  it("emits a sale when cargo falls and gold rises in port", () => {
    const prev = withShip(makeState(), "0", { cargo: { ...emptyCargo(), Sugar: 3 } });
    const next = withShip(prev, "0", { cargo: emptyCargo(), gold: 145 });
    expect(soundEventsFrom(prev, next)).toEqual([{ type: "goodsSold", shipId: "0", good: "Sugar", amount: 3 }]);
  });

  it("does not call a cargo change a trade when gold did not move the other way", () => {
    // Boarding loot, say: cargo and gold both rise
    const prev = makeState();
    const next = withShip(prev, "0", { cargo: { ...emptyCargo(), Wood: 2 }, gold: 120 });
    expect(soundEventsFrom(prev, next)).toEqual([]);
  });

  it("emits an upgrade, a repair, a new ship and a stash", () => {
    const prev = withShip(makeState(), "0", { damage: { hull: 2, crew: 0, masts: 0 } });
    expect(soundEventsFrom(prev, withShip(prev, "0", { upgrades: ["copper"], gold: 50 }))).toEqual([
      { type: "upgradeBought", shipId: "0", upgradeId: "copper" },
    ]);
    expect(soundEventsFrom(prev, withShip(prev, "0", { damage: { hull: 0, crew: 0, masts: 0 }, gold: 80 }))).toEqual([
      { type: "shipRepaired", shipId: "0" },
    ]);
    expect(soundEventsFrom(prev, withShip(prev, "0", { shipClass: "Frigate", gold: 10 }))).toEqual([
      { type: "shipBought", shipId: "0", shipClass: "Frigate" },
    ]);
    expect(soundEventsFrom(prev, withShip(prev, "0", { stashedGold: 30, gold: 70 }))).toEqual([
      { type: "goldStashed", shipId: "0", amount: 30 },
    ]);
  });

  it("emits the start of a combat", () => {
    const prev = makeState();
    const next = makeState({ combat: makeCombat() });
    expect(soundEventsFrom(prev, next)).toEqual([{ type: "combatStarted", attackerId: "0", defenderId: "1" }]);
  });

  it("emits the seamanship roll as it leaves the seamanship stage", () => {
    const prev = makeState({ combat: makeCombat() });
    const next = makeState({ combat: makeCombat({ stage: "chooseAction", seamanshipWinner: "0" }) });
    expect(soundEventsFrom(prev, next)).toEqual([{ type: "seamanshipRolled" }]);
  });

  it("emits cannon fire with both sides' hits when the cannons are rolled", () => {
    const prev = makeState({ combat: makeCombat({ stage: "cannons", actionChosen: "fire" }) });
    const next = makeState({
      combat: makeCombat({ stage: "resolution", actionChosen: "fire", attackerHits: 2, defenderHits: 1 }),
    });
    expect(soundEventsFrom(prev, next)).toEqual([{ type: "cannonsFired", attackerHits: 2, defenderHits: 1 }]);
  });

  it("emits a boarding when the action choice ends the combat", () => {
    const prev = makeState({ combat: makeCombat({ stage: "chooseAction", seamanshipWinner: "0" }) });
    const next = makeState();
    expect(soundEventsFrom(prev, next)).toEqual([
      { type: "boarded", attackerId: "0", defenderId: "1" },
      { type: "combatEnded" },
    ]);
  });

  it("emits a flee and its outcome", () => {
    const prev = makeState({ combat: makeCombat({ stage: "fleeAttempt", seamanshipWinner: "1" }) });
    expect(soundEventsFrom(prev, makeState())).toEqual([
      { type: "fleeAttempted", outcome: "escaped" },
      { type: "combatEnded" },
    ]);
    const caught = makeState({ combat: makeCombat({ stage: "cannons", fleeOutcome: "caught" }) });
    expect(soundEventsFrom(prev, caught)).toEqual([{ type: "fleeAttempted", outcome: "caught" }]);
  });

  it("emits a sinking when a ship or NPC goes and loot appears", () => {
    const loot = { id: "loot-1", hex: hex(4, 4), cargo: emptyCargo(), gold: 5 };
    const prev = makeState({ combat: makeCombat({ stage: "resolution", attackerHits: 3 }) });
    const { "1": sunk, ...rest } = prev.ships;
    expect(sunk).toBeDefined();
    const next = makeState({ ships: rest, floatingLoot: [loot] });
    expect(soundEventsFrom(prev, next)).toEqual([
      { type: "shipSunk", shipId: "1", isNpc: false },
      { type: "combatEnded" },
    ]);

    const prevNpc = makeState({ npcs: { "npc-1": makeNpc() } });
    const nextNpc = makeState({ floatingLoot: [loot] });
    expect(soundEventsFrom(prevNpc, nextNpc)).toEqual([{ type: "shipSunk", shipId: "npc-1", isNpc: true }]);
  });

  it("does not call an NPC that leaves without loot a sinking", () => {
    const prev = makeState({ npcs: { "npc-1": makeNpc() } });
    expect(soundEventsFrom(prev, makeState())).toEqual([]);
  });

  it("emits a ship going derelict", () => {
    const prev = makeState();
    expect(soundEventsFrom(prev, withShip(prev, "1", { isDerelict: true }))).toEqual([
      { type: "shipDerelict", shipId: "1" },
    ]);
  });
});
