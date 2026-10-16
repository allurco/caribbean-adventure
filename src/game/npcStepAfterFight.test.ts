import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexEquals, hexGrid, type Hex } from "./hex";
import type { MapCell } from "./mapGenerator";
import { WIN_SCORE, type Captain, type CaribbeanState, type NPCShip, type ShipState } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { fightOneRound, fightToTheEnd, fireTheAmbush } from "../testSupport/combatSteps";
import { createShipState } from "./economy";

/**
 * The NPCs' end-of-turn step around a fight, played through a real Caribbean
 * client (#288). An attack ends the attacker's turn (#284); the NPCs then
 * sail once, after the fight resolves: not during it, and not twice, however
 * the fight ends.
 *
 * Each step draws one event card (#246), so the cards drawn count the steps.
 */

const PORT = hex(-4, 0);
const DOCK = hex(-3, 0);

/** A second port, to the south, so a new merchant has somewhere to sail. */
const HAVANA = hex(0, 5);

/** Open water, with an English port on the west side and a Spanish one to the south. */
const cells: MapCell[] = hexGrid(5).map((h) =>
  hexEquals(h, PORT)
    ? { hex: h, terrain: "island", hasPort: true, nation: "England", portName: "Port Royal", dockingHex: DOCK, elevation: 1 }
    : hexEquals(h, HAVANA)
      ? { hex: h, terrain: "island", hasPort: true, nation: "Spain", portName: "Havana", dockingHex: hex(0, 4), elevation: 1 }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0 }
);

const captain = (id: string): Captain => ({ id, name: id, nation: "England", ability: "" });

/** A player ship. With guns it wins every seamanship roll and fires twenty; without, one hit sinks it. */
function ship(q: number, r: number, id: string, guns: boolean): ShipState {
  const s = createShipState(hex(q, r), "Galleon");
  s.stats!.maneuverability = guns ? 20 : 0;
  s.stats!.cannons = guns ? 20 : 0;
  s.stats!.crew = { current: 20, max: 20 };
  s.stats!.hull = guns ? { current: 40, max: 40 } : { current: 1, max: 1 };
  s.captain = captain(id);
  return s;
}

/** An unarmed merchant at `at`, sailing `speed` hexes a step toward the dock. */
function merchant(id: string, at: Hex, speed: number): NPCShip {
  return {
    id,
    position: at,
    cargo: { Wood: 0, Sugar: 2, Rum: 0, Spice: 0 },
    gold: 5,
    shipClass: "Flute",
    stats: {
      maneuverability: speed,
      scouting: 1,
      cannons: 0,
      crew: { current: 1, max: 1 },
      hull: { current: 1, max: 1 },
      cargo: 8,
      shallowDraft: false,
    },
    damage: { hull: 0, crew: 0, masts: 0 },
    nation: "Spain",
    aiBehavior: "MERCHANT_ROUTE",
    destinationPortHex: DOCK,
    spawnPortHex: PORT,
    isIdentified: false,
    bounty: 0,
    role: "MERCHANT",
    huntingTargetId: null,
  };
}

/** A seed found to give the rolls a test needs: a flight caught. */
const CAUGHT_SEED = "s2";

/** The merchant to attack, beside seat 0. */
const npcs = (): Record<string, NPCShip> => ({
  prey: merchant("prey", hex(-1, 0), 0),
});

function startGame(ships: Record<string, ShipState>, extra: Partial<CaribbeanState> = {}, seed = "npc-step-after-fight-288") {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed,
    phases: {
      main: { ...(Caribbean.phases?.main ?? {}), start: true },
      combat: Caribbean.phases!.combat!,
    },
    setup: () => ({
      cells,
      ships,
      mapSize: "small",
      captainDeck: [captain("drake"), captain("morgan"), captain("hein"), captain("rackham")],
      draftHands: {},
      floatingLoot: [],
      npcs: npcs(),
      npcIdCounter: 0,
      wrap: null,
      pirates: {},
      bountyClaims: [],
      movesUsed: 0,
      ...extra,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: Object.keys(ships).length });
  client.start();
  return client;
}

type TestClient = ReturnType<typeof startGame>;
const stateOf = (client: TestClient) => client.getState()!;

/** How many end-of-turn steps the world has taken: one event card is drawn in each. */
const npcSteps = (client: TestClient): number => stateOf(client).G.eventDeck?.drawn ?? 0;

/** Two seats side by side, seat 0 to attack seat 1. */
const twoSeats = (guns: [boolean, boolean] = [true, true]): Record<string, ShipState> => ({
  "0": ship(0, 0, "blackbeard", guns[0]),
  "1": ship(1, 0, "surcouf", guns[1]),
});

/** Play cannon fire through to the end of the fight. */
function fireToTheEnd(client: TestClient): void {
  fightToTheEnd(client);
}

function expectFightOver(client: TestClient): void {
  expect(stateOf(client).G.combat).toBeUndefined();
  expect(stateOf(client).ctx.phase).toBe("main");
}

describe("the NPCs' step at the end of a turn (#288)", () => {
  it("a turn without a fight: the NPCs sail once as it ends", () => {
    const client = startGame(twoSeats());
    client.events.endTurn!();
    expect(npcSteps(client)).toBe(1);
    client.events.endTurn!();
    expect(npcSteps(client)).toBe(2);
  });

  it("not during the fight: the NPCs hold still until it resolves", () => {
    const client = startGame(twoSeats());
    client.moves.attackNPC("prey");
    expect(stateOf(client).ctx.phase).toBe("combat");
    expect(npcSteps(client)).toBe(0);
    client.moves.rollCannons();
    expect(npcSteps(client)).toBe(0);
  });

  it("an NPC sunk: the NPCs sail once after the fight", () => {
    const client = startGame(twoSeats());
    client.moves.attackNPC("prey");
    fireToTheEnd(client);
    expectFightOver(client);
    expect(stateOf(client).G.npcs.prey).toBeUndefined();
    expect(npcSteps(client)).toBe(1);
  });

  it("an NPC boarded: the NPCs sail once after the fight", () => {
    // Gunless, so the ambush (#346) leaves the prey afloat; the faster sailor wins round 2's draw.
    const seats = twoSeats([false, true]);
    seats["0"].stats!.maneuverability = 20;
    const client = startGame(seats);
    client.moves.attackNPC("prey");
    fireTheAmbush(client);
    client.moves.rollSeamanship();
    client.moves.chooseCombatAction("board");
    expectFightOver(client);
    expect(stateOf(client).G.npcs.prey).toBeUndefined();
    expect(npcSteps(client)).toBe(1);
  });

  it("solo: a fight with an NPC, then the one seat's next turn, each move the NPCs once", () => {
    const client = startGame({ "0": ship(0, 0, "blackbeard", true) });
    client.moves.attackNPC("prey");
    fireToTheEnd(client);
    expectFightOver(client);
    expect(npcSteps(client)).toBe(1);
    client.events.endTurn!();
    expect(npcSteps(client)).toBe(2);
  });

  it("a fight between seats, won: the NPCs sail once", () => {
    const client = startGame(twoSeats([true, false]));
    client.moves.attackShip("1");
    fireToTheEnd(client);
    expectFightOver(client);
    expect(stateOf(client).G.ships["1"]).toBeUndefined();
    expect(npcSteps(client)).toBe(1);
  });

  it("a fight between seats, lost: the NPCs sail once", () => {
    const client = startGame(twoSeats([false, true]));
    client.moves.attackShip("1");
    fireToTheEnd(client);
    expectFightOver(client);
    expect(stateOf(client).G.ships["0"]).toBeUndefined();
    expect(npcSteps(client)).toBe(1);
  });

  it("a fight between seats, boarded: the NPCs sail once", () => {
    const client = startGame(twoSeats());
    client.moves.attackShip("1");
    fireTheAmbush(client);
    client.moves.rollSeamanship();
    client.moves.rollDefenderSeamanship();
    client.moves.chooseCombatAction("board");
    expectFightOver(client);
    expect(npcSteps(client)).toBe(1);
  });

  it("a flight from the fight, escaped: the NPCs sail once", () => {
    // The attacker, far the better sailor, wins seamanship and gets clean away
    const seats = twoSeats();
    seats["1"].stats!.maneuverability = 0;
    const client = startGame(seats);
    client.moves.attackShip("1");
    fireTheAmbush(client);
    client.moves.rollSeamanship();
    client.moves.rollDefenderSeamanship();
    client.moves.chooseCombatAction("flee");
    client.moves.rollFleeAttempt();
    expectFightOver(client);
    expect(npcSteps(client)).toBe(1);
  });

  it("a flight from the fight, caught: the parting shot ends it, and the NPCs sail once", () => {
    // Evenly matched sailors; this seed's rolls catch the one who flees
    const seats = twoSeats();
    seats["1"].stats!.maneuverability = seats["0"].stats!.maneuverability;
    const client = startGame(seats, {}, CAUGHT_SEED);
    client.moves.attackShip("1");
    fireTheAmbush(client);
    client.moves.rollSeamanship();
    client.moves.rollDefenderSeamanship();
    client.moves.chooseCombatAction("flee");
    client.moves.rollFleeAttempt();
    expect(stateOf(client).G.combat?.fleeOutcome).toBe("caught");
    client.moves.rollCannons();
    expect(npcSteps(client)).toBe(0);
    client.moves.applyResolution();
    expectFightOver(client);
    expect(npcSteps(client)).toBe(1);
  });

  it("a new merchant can put to sea in the step after a fight: a convoy drawn as it ends", () => {
    const client = startGame(twoSeats(), { eventDeck: { drawPile: ["merchantConvoy"], log: [], drawn: 0 } });
    client.moves.attackNPC("prey");
    fireToTheEnd(client);
    expectFightOver(client);
    expect(npcSteps(client)).toBe(1);
    const spawned = Object.values(stateOf(client).G.npcs);
    expect(spawned.length).toBeGreaterThanOrEqual(1);
    expect(spawned.every((npc) => npc.role === "MERCHANT")).toBe(true);
  });

  it("a defender the ambush sinks never fires back (#346): the NPCs sail once", () => {
    const seats = twoSeats();
    seats["0"].stats!.hull = { current: 1, max: 1 };
    seats["1"].stats!.hull = { current: 1, max: 1 };
    const client = startGame(seats);
    client.moves.attackShip("1");
    fireToTheEnd(client);
    expectFightOver(client);
    expect(Object.keys(stateOf(client).G.ships)).toEqual(["0"]);
    expect(npcSteps(client)).toBe(1);
  });

  // The game ends there: boardgame.io ends no turn after it, so the NPCs
  // take no step, as on any turn that wins the game
  it("a fight that wins the game: the game ends with the NPCs where they were", () => {
    const seats = twoSeats([true, false]);
    seats["0"].score = WIN_SCORE - 1;
    const client = startGame(seats);
    client.moves.attackShip("1");
    fireToTheEnd(client);
    expect(stateOf(client).ctx.gameover).toMatchObject({ winner: "0" });
    expect(npcSteps(client)).toBe(0);
  });

  it("a fight that runs several rounds: the NPCs sail once, at its end", () => {
    const seats = twoSeats();
    // Both sides armed but sturdy: the first exchange sinks nobody
    seats["0"].stats!.cannons = 1;
    seats["1"].stats!.cannons = 1;
    seats["0"].stats!.hull = { current: 3, max: 3 };
    seats["1"].stats!.hull = { current: 3, max: 3 };
    const client = startGame(seats);
    client.moves.attackShip("1");
    let rounds = 0;
    while (stateOf(client).G.combat && rounds < 200) {
      fightOneRound(client);
      rounds++;
      if (stateOf(client).G.combat) expect(npcSteps(client)).toBe(0);
    }
    expect(rounds).toBeGreaterThan(1);
    expectFightOver(client);
    expect(npcSteps(client)).toBe(1);
  });
});
