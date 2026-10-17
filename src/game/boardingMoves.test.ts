import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, Mission, NPCRole, NPCShip, ShipState } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { MAX_MAST_DAMAGE } from "./combat";
import { applyBoarding, canChooseCombatAction, canFightBoarding, openFight } from "./combatMoves";
import { createShipState, totalCargo } from "./economy";
import { silenceInvalidMoveLogs } from "../testSupport/silenceInvalidMoveLogs";
import { fightOneRound, fightToTheEnd } from "../testSupport/combatSteps";

// Refused moves are sent on purpose; boardgame.io logs each one.
silenceInvalidMoveLogs();

/**
 * Boarding (#350), played through a boardgame.io client: from round 2 the
 * draw's winner may board a ship 1 hex away, and the crew fight decides it.
 * A manoeuvrability of 20 wins every draw; a defender at 1 crew strikes at
 * once, so those fights need no dice. Fights whose dice matter are settled
 * by `applyBoarding` with dice set out in order.
 */

const cells: MapCell[] = hexGrid(5).map((h) => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 }));
const captain = (id: string): Captain => ({ id, name: id, nation: "England", ability: "" });
const noCargo = { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 };

interface Rig {
  maneuverability?: number;
  crew?: number;
  gold?: number;
  cargo?: Partial<ShipState["cargo"]>;
  masts?: number;
}

/** A gunless Galleon (hold of 6) at (q, r), rigged as asked. */
function ship(q: number, r: number, rig: Rig = {}): ShipState {
  const s = createShipState(hex(q, r), "Galleon");
  s.stats!.maneuverability = rig.maneuverability ?? 0;
  s.stats!.cannons = 0;
  s.stats!.crew = { current: rig.crew ?? 5, max: 5 };
  s.gold = rig.gold ?? 0;
  s.cargo = { ...noCargo, ...rig.cargo };
  s.damage.masts = rig.masts ?? 0;
  s.captain = captain(`captain-${q}-${r}`);
  return s;
}

/** A gunless NPC beside seat 0, its hold of 8. */
function npc(role: NPCRole, rig: Rig = {}): NPCShip {
  return {
    id: "foe",
    position: hex(1, 0),
    cargo: { ...noCargo, Wood: 1, Sugar: 2, Rum: 3, ...rig.cargo },
    gold: rig.gold ?? 17,
    shipClass: "Flute",
    stats: {
      maneuverability: rig.maneuverability ?? 0,
      scouting: 1,
      cannons: 0,
      crew: { current: rig.crew ?? 5, max: 5 },
      hull: { current: 5, max: 5 },
      cargo: 8,
      shallowDraft: false,
    },
    damage: { hull: 0, crew: 0, masts: 0 },
    nation: "Spain",
    aiBehavior: role === "MERCHANT" ? "MERCHANT_ROUTE" : "HUNTER",
    destinationPortHex: hex(-5, 0),
    spawnPortHex: hex(5, 0),
    isIdentified: false,
    bounty: 10,
    role,
    huntingTargetId: null,
  };
}

function setupOf(ships: Record<string, ShipState>, npcs: Record<string, NPCShip>, combat?: CaribbeanState["combat"]) {
  return () => ({
    cells,
    ships,
    mapSize: "small" as const,
    captainDeck: [],
    draftHands: {},
    floatingLoot: [],
    npcs,
    npcIdCounter: 0,
    lootIdCounter: 4,
    wrap: null,
    pirates: {},
    bountyClaims: [],
    movesUsed: 0,
    ...(combat ? { combat } : {}),
  });
}

function startGame(ships: Record<string, ShipState>, npcs: Record<string, NPCShip> = {}, combat?: CaribbeanState["combat"]) {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed: "boarding-350",
    phases: {
      main: { ...Caribbean.phases!.main!, start: !combat },
      combat: { ...Caribbean.phases!.combat!, start: !!combat },
    },
    setup: setupOf(ships, npcs, combat) as Game<CaribbeanState>["setup"],
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: Object.keys(ships).length });
  client.start();
  return client;
}

type TestClient = ReturnType<typeof startGame>;
const G = (client: TestClient) => client.getState()!.G;

/** Seat 0 attacks `target`, the ambush passes (no guns), and round 2's draw is in: at the choice. */
function atTheChoice(client: TestClient, target: { ship: string } | { npc: string }) {
  if ("ship" in target) client.moves.attackShip(target.ship);
  else client.moves.attackNPC(target.npc);
  fightOneRound(client);
  client.moves.rollSeamanship();
  if (G(client).combat?.stage === "defenderSeamanship") client.moves.rollDefenderSeamanship();
  expect(G(client).combat).toMatchObject({ round: 2, stage: "chooseAction" });
}

/** A fight between seats 0 and 1 stored at the boarding, `boarder` having won the draw. */
function boardingG(ships: Record<string, ShipState>, boarder = "0"): CaribbeanState {
  const client = startGame(ships, {}, { ...openFight("0", "1", 1, false), round: 2, stage: "boarding", seamanshipWinner: boarder, actionChosen: "board" });
  return structuredClone(G(client));
}

/** Dice in this order, then misses. */
function diceOf(...faces: number[]): () => number {
  let i = 0;
  return () => faces[i++] ?? 1;
}

const mission = (type: Mission["type"], extra: Partial<Mission> = {}): Mission => ({
  id: "m-1",
  title: type,
  description: type,
  type,
  reward: { gold: 50, glory: 2 },
  status: "ACTIVE",
  ...extra,
});

describe("Board is offered from round 2 to the draw's winner, 1 hex away (#350)", () => {
  it("chosen, the fight goes to the boarding, the boarder's step: no cannon fire that round", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 20 }), "1": ship(1, 0) });
    atTheChoice(client, { ship: "1" });
    client.moves.chooseCombatAction("board");
    expect(G(client).combat).toMatchObject({ stage: "boarding", actionChosen: "board", seamanshipWinner: "0" });
    // No cannon fire in a boarding round
    client.moves.rollCannons();
    expect(G(client).combat).toMatchObject({ stage: "boarding" });
  });

  it("is the defender's to choose when the defender wins the draw", () => {
    const client = startGame({ "0": ship(0, 0), "1": ship(1, 0, { maneuverability: 20 }) });
    atTheChoice(client, { ship: "1" });
    expect(G(client).combat!.seamanshipWinner).toBe("1");
    client.moves.chooseCombatAction("board");
    expect(G(client).combat).toMatchObject({ stage: "boarding", seamanshipWinner: "1" });
  });

  it("is refused to a boarder with fewer than 2 crew", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 20, crew: 1 }), "1": ship(1, 0) });
    atTheChoice(client, { ship: "1" });
    expect(canChooseCombatAction(G(client), "board")).toBe(false);
    client.moves.chooseCombatAction("board");
    expect(G(client).combat!.stage).toBe("chooseAction");
  });

  it("is still offered to a ship whose masts are shot away", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 20, masts: MAX_MAST_DAMAGE }), "1": ship(1, 0) });
    atTheChoice(client, { ship: "1" });
    expect(canChooseCombatAction(G(client), "board")).toBe(true);
  });

  it("the boarding takes no argument, and only at its own stage", () => {
    const G0 = boardingG({ "0": ship(0, 0), "1": ship(1, 0) });
    expect(canFightBoarding(G0)).toBe(true);
    expect(canFightBoarding(G0, "crew")).toBe(false);
    expect(canFightBoarding({ ...G0, combat: { ...G0.combat!, stage: "chooseAction" } })).toBe(false);
  });
});

describe("boarding another captain (#350)", () => {
  it("to the striking of the colours: the winner takes all the gold and what fits; the rest floats, the loser keeps its ship with 1 crew", () => {
    const client = startGame({
      "0": ship(0, 0, { maneuverability: 20, gold: 5, cargo: { Wood: 4 } }),
      "1": ship(1, 0, { crew: 1, gold: 30, cargo: { Sugar: 3, Rum: 2 } }),
    });
    atTheChoice(client, { ship: "1" });
    client.moves.chooseCombatAction("board");
    client.moves.fightBoarding();

    const after = G(client);
    expect(after.combat).toBeUndefined();
    expect(client.getState()!.ctx.phase).toBe("main");
    // Gold all taken; the hold of 6 had room for 2 of the 5 (Sugar first, in the goods' order)
    expect(after.ships["0"].gold).toBe(35);
    expect(after.ships["0"].cargo).toEqual({ Wood: 4, Sugar: 2, Rum: 0, Spice: 0 });
    expect(after.ships["1"].gold).toBe(0);
    expect(after.ships["1"].cargo).toEqual(noCargo);
    expect(after.ships["1"].stats!.crew.current).toBe(1);
    expect(after.ships["1"].isDerelict).toBeUndefined();
    // The loot that did not fit floats at the loser's hex, its id from the game's counter
    expect(after.floatingLoot).toEqual([{ id: "loot-5", hex: hex(1, 0), cargo: { Wood: 0, Sugar: 1, Rum: 2, Spice: 0 }, gold: 0 }]);
    expect(after.lastRound).toMatchObject({
      round: 2,
      ended: true,
      volleys: [],
      sunk: [],
      boarding: { boarderId: "0", boardedId: "1", winnerId: "0", exchanges: [], gold: 30, taken: { Sugar: 2 }, floated: { Sugar: 1, Rum: 2 }, lootId: "loot-5" },
    });
  });

  it("played to the end with the boardgame.io dice: a side strikes at 1 crew, and no hold overflows", () => {
    const client = startGame({
      "0": ship(0, 0, { gold: 3, cargo: { Wood: 5 } }),
      "1": ship(1, 0, { gold: 7, cargo: { Sugar: 4, Spice: 1 } }),
    });
    client.moves.attackShip("1");
    fightToTheEnd(client, "board");

    const after = G(client);
    const boarding = after.lastRound!.boarding!;
    expect(after.combat).toBeUndefined();
    expect(boarding.exchanges.length).toBeGreaterThan(0);
    const loser = boarding.winnerId === "0" ? "1" : "0";
    expect(after.ships[loser].stats!.crew.current).toBe(1);
    expect(after.ships[loser]).toMatchObject({ gold: 0, cargo: noCargo });
    expect(after.ships[boarding.winnerId].gold).toBe(10);
    expect(totalCargo(after.ships[boarding.winnerId].cargo)).toBe(6);
    // 10 crates between them, a hold of 6: the other 4 float
    expect(after.floatingLoot).toHaveLength(1);
    expect(totalCargo(after.floatingLoot[0].cargo)).toBe(4);
  });

  it("with everything fitting, nothing floats", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 20 }), "1": ship(1, 0, { crew: 1, cargo: { Spice: 2 } }) });
    atTheChoice(client, { ship: "1" });
    client.moves.chooseCombatAction("board");
    client.moves.fightBoarding();
    expect(G(client).ships["0"].cargo.Spice).toBe(2);
    expect(G(client).floatingLoot).toEqual([]);
    expect(G(client).lastRound!.boarding).toMatchObject({ floated: null });
  });

  it("a boarder beaten off strikes instead: the defender takes its gold and cargo, and the boarder keeps 1 crew", () => {
    const G0 = boardingG({ "0": ship(0, 0, { crew: 2, gold: 12, cargo: { Rum: 1 } }), "1": ship(1, 0, { crew: 3 }) });
    // Boarder's 2 dice miss; the defender's 3 dice kill one: the boarder is down to 1 and strikes
    expect(applyBoarding(G0, diceOf(1, 1, 6, 1, 1), 1)).toBe("ended");
    expect(G0.ships["0"]).toMatchObject({ gold: 0, cargo: noCargo });
    expect(G0.ships["0"].stats!.crew.current).toBe(1);
    expect(G0.ships["1"]).toMatchObject({ gold: 12, cargo: { ...noCargo, Rum: 1 } });
    expect(G0.ships["1"].stats!.crew.current).toBe(3);
    expect(G0.lastRound!.boarding).toMatchObject({ winnerId: "1", exchanges: [{ boarderDice: [1, 1], defenderDice: [6, 1, 1], boarderCrew: 1, defenderCrew: 3 }] });
  });

  it("the crew each side lost is counted as crew damage, and both reaching 1 together goes to the boarder", () => {
    const G0 = boardingG({ "0": ship(0, 0, { crew: 2 }), "1": ship(1, 0, { crew: 2, gold: 9 }) });
    applyBoarding(G0, diceOf(6, 1, 6, 1), 1);
    expect(G0.ships["0"].stats!.crew.current).toBe(1);
    expect(G0.ships["1"].stats!.crew.current).toBe(1);
    expect(G0.ships["0"].damage.crew).toBe(1);
    expect(G0.ships["1"].damage.crew).toBe(1);
    expect(G0.ships["0"].gold).toBe(9);
  });

  it("winning gives the combat glory of sinking another captain", () => {
    const G0 = boardingG({ "0": ship(0, 0), "1": ship(1, 0, { crew: 1 }) });
    applyBoarding(G0, diceOf(), 1);
    expect(G0.ships["0"].score).toBe(1);
  });

  it("a ship on an escort that loses crew fails the escort's no-damage condition", () => {
    const escort = ship(0, 0, { crew: 3 });
    escort.activeMission = mission("ESCORT", { targetPortName: "Havana", noDamageTaken: true });
    const G0 = boardingG({ "0": escort, "1": ship(1, 0, { crew: 2 }) });
    applyBoarding(G0, diceOf(6, 6, 1, 6, 1), 1);
    expect(G0.ships["0"].stats!.crew.current).toBe(2);
    expect(G0.ships["0"].activeMission?.noDamageTaken).toBe(false);
  });
});

describe("boarding an NPC (#350)", () => {
  it("a merchant: the crew fight, then it is gone, its cargo, gold and bounty as before", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 20 }) }, { foe: npc("MERCHANT", { crew: 1 }) });
    atTheChoice(client, { npc: "foe" });
    client.moves.chooseCombatAction("board");
    expect(G(client).combat).toMatchObject({ stage: "boarding" });
    client.moves.fightBoarding();

    const after = G(client);
    expect(after.combat).toBeUndefined();
    expect(after.npcs.foe).toBeUndefined();
    expect(after.ships["0"].gold).toBe(17);
    expect(after.ships["0"].cargo).toEqual({ Wood: 1, Sugar: 2, Rum: 3, Spice: 0 });
    expect(after.ships["0"].bounties.Spain).toBeGreaterThan(0);
    expect(after.pirates?.["0"]).toMatchObject({ cause: "board" });
    expect(after.ships["0"].score).toBe(0);
  });

  it("its cargo that does not fit the hold floats at its hex", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 20, cargo: { Spice: 4 } }) }, { foe: npc("MERCHANT", { crew: 1 }) });
    atTheChoice(client, { npc: "foe" });
    client.moves.chooseCombatAction("board");
    client.moves.fightBoarding();
    expect(G(client).ships["0"].cargo).toEqual({ Wood: 1, Sugar: 1, Rum: 0, Spice: 4 });
    expect(G(client).floatingLoot).toEqual([{ id: "loot-5", hex: hex(1, 0), cargo: { Wood: 0, Sugar: 1, Rum: 3, Spice: 0 }, gold: 0 }]);
  });

  it("a flotilla won gives the combat glory of sinking it, and no bounty", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 20 }) }, { foe: npc("FLOTILLA", { crew: 1 }) });
    atTheChoice(client, { npc: "foe" });
    client.moves.chooseCombatAction("board");
    client.moves.fightBoarding();
    expect(G(client).npcs.foe).toBeUndefined();
    expect(G(client).ships["0"].score).toBe(1);
    expect(G(client).ships["0"].bounties.Spain).toBe(0);
  });

  it("the NPC an assassination names, boarded and won, completes the mission: reward paid, mission cleared", () => {
    const hunter = ship(0, 0, { maneuverability: 20 });
    hunter.activeMission = mission("ASSASSINATION", { targetNpcId: "foe" });
    const client = startGame({ "0": hunter }, { foe: npc("FLOTILLA", { crew: 1, gold: 0 }) });
    atTheChoice(client, { npc: "foe" });
    client.moves.chooseCombatAction("board");
    client.moves.fightBoarding();
    expect(G(client).ships["0"].activeMission).toBeUndefined();
    expect(G(client).ships["0"].gold).toBe(50);
    // The mission's glory and the flotilla's
    expect(G(client).ships["0"].score).toBe(3);
  });

  it("an NPC that beats off the boarder takes the boarder's gold and cargo, and stays; the boarder keeps 1 crew", () => {
    const client = startGame({ "0": ship(0, 0, { crew: 2, gold: 8, cargo: { Rum: 1 } }) }, { foe: npc("MERCHANT", { cargo: { Wood: 0, Sugar: 0, Rum: 0 }, gold: 0 }) });
    const G0 = structuredClone(G(client));
    G0.combat = { ...openFight("0", "foe", 1, true), round: 2, stage: "boarding", seamanshipWinner: "0", actionChosen: "board" };
    applyBoarding(G0, diceOf(1, 1, 6, 1, 1, 1, 1), 1);
    expect(G0.npcs.foe).toMatchObject({ gold: 8, cargo: { ...noCargo, Rum: 1 } });
    expect(G0.ships["0"]).toMatchObject({ gold: 0, cargo: noCargo });
    expect(G0.ships["0"].stats!.crew.current).toBe(1);
    expect(G0.ships["0"].bounties.Spain).toBe(0);
    expect(G0.lastRound!.boarding!.winnerId).toBe("foe");
  });
});
