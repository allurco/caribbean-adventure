import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexEquals, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, NPCShip, ShipState } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { createShipState } from "./economy";

/**
 * The turn order around a fight, played through a real Caribbean client with
 * three seats (#284): a fight ends the attacker's turn, and the turn then
 * passes to the seat after the attacker, as any other turn's end would.
 */

const PORT = hex(-4, 0);
const DOCK = hex(-3, 0);

/** Open water, with one English port on the west side. */
const cells: MapCell[] = hexGrid(5).map((h) =>
  hexEquals(h, PORT)
    ? { hex: h, terrain: "island", hasPort: true, nation: "England", portName: "Port Royal", dockingHex: DOCK, elevation: 1 }
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

/** An unarmed merchant at (q, r): one exchange of fire sinks it. */
function merchant(q: number, r: number): NPCShip {
  return {
    id: "merchant",
    position: hex(q, r),
    cargo: { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 },
    gold: 0,
    shipClass: "Flute",
    stats: {
      maneuverability: 0,
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
    destinationPortHex: PORT,
    spawnPortHex: PORT,
    isIdentified: false,
    bounty: 0,
    role: "MERCHANT",
    huntingTargetId: null,
  };
}

/** Three seats side by side: seat 0 next to both seats 1 and 2. */
function threeSeats(guns: [boolean, boolean, boolean] = [true, true, true]): Record<string, ShipState> {
  return {
    "0": ship(0, 0, "blackbeard", guns[0]),
    "1": ship(1, 0, "surcouf", guns[1]),
    "2": ship(0, 1, "kidd", guns[2]),
  };
}

function startGame(ships: Record<string, ShipState>, extra: Partial<CaribbeanState> = {}) {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed: "combat-turn-order-284",
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
      npcs: {},
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
const current = (client: TestClient) => stateOf(client).ctx.currentPlayer;

/** The attacker wins seamanship and boards: the fight ends with nobody sunk. */
function boardOnce(client: TestClient): void {
  client.moves.rollSeamanship();
  client.moves.chooseCombatAction("board");
  expect(stateOf(client).G.combat).toBeUndefined();
  expect(stateOf(client).ctx.phase).toBe("main");
}

/** Play one exchange of cannon fire through to the end of the combat. */
function fireOnce(client: TestClient): void {
  client.moves.rollSeamanship();
  client.moves.chooseCombatAction("fire");
  client.moves.rollCannons();
  client.moves.applyResolution();
  expect(stateOf(client).G.combat).toBeUndefined();
  expect(stateOf(client).ctx.phase).toBe("main");
}

/** The seats whose turns come next, one per `endTurn`. */
function nextTurns(client: TestClient, count: number): string[] {
  const seats: string[] = [];
  for (let i = 0; i < count; i++) {
    client.events.endTurn!();
    seats.push(current(client));
  }
  return seats;
}

describe("the turn after a fight, with three seats (#284)", () => {
  it("the attacker stays the current player through the fight", () => {
    const client = startGame(threeSeats());
    client.moves.attackShip("1");
    expect(stateOf(client).ctx.phase).toBe("combat");
    expect(current(client)).toBe("0");
    client.moves.rollSeamanship();
    expect(current(client)).toBe("0");
  });

  it("seat 0 attacks seat 1 and nobody sinks: the next turn is seat 1's", () => {
    const client = startGame(threeSeats());
    client.moves.attackShip("1");
    boardOnce(client);

    expect(current(client)).toBe("1");
    expect(nextTurns(client, 3)).toEqual(["2", "0", "1"]);
  });

  it("seat 0 attacks seat 2 and nobody sinks: the next turn is seat 1's", () => {
    const client = startGame(threeSeats());
    client.moves.attackShip("2");
    boardOnce(client);

    expect(current(client)).toBe("1");
    expect(nextTurns(client, 3)).toEqual(["2", "0", "1"]);
  });

  it("a fight on a later seat's turn passes the turn to the seat after it", () => {
    const client = startGame(threeSeats());
    client.events.endTurn!();
    expect(current(client)).toBe("1");
    client.moves.attackShip("0");
    boardOnce(client);

    expect(current(client)).toBe("2");
  });

  it("the attacker sinks: the seats after it each get their turn, and the lost seat is dealt a hand on its next", () => {
    const client = startGame(threeSeats([false, true, true]));
    client.moves.attackShip("1");
    fireOnce(client);

    expect(stateOf(client).G.ships["0"]).toBeUndefined();
    expect(current(client)).toBe("1");
    expect(nextTurns(client, 2)).toEqual(["2", "0"]);
    expect(stateOf(client).G.draftHands["0"]).toHaveLength(2);
    client.moves.pickCaptain(0, "Sloop");
    expect(stateOf(client).G.ships["0"].captain).toEqual(captain("drake"));
    expect(nextTurns(client, 1)).toEqual(["1"]);
  });

  it("the defender sinks: the defender's turn comes next, and it picks a new captain", () => {
    const client = startGame(threeSeats([true, false, true]));
    client.moves.attackShip("1");
    fireOnce(client);

    expect(stateOf(client).G.ships["1"]).toBeUndefined();
    expect(current(client)).toBe("1");
    expect(stateOf(client).G.draftHands["1"]).toHaveLength(2);
    client.moves.pickCaptain(0, "Sloop");
    expect(nextTurns(client, 3)).toEqual(["2", "0", "1"]);
  });

  it("both ships sink: the defender picks first, then every seat in turn, none skipped or doubled", () => {
    const seats = threeSeats();
    seats["0"].stats!.hull = { current: 1, max: 1 };
    seats["1"].stats!.hull = { current: 1, max: 1 };
    const client = startGame(seats);
    client.moves.attackShip("1");
    fireOnce(client);

    expect(Object.keys(stateOf(client).G.ships)).toEqual(["2"]);
    expect(current(client)).toBe("1");
    client.moves.pickCaptain(0, "Sloop");
    expect(nextTurns(client, 1)).toEqual(["2"]);
    expect(nextTurns(client, 1)).toEqual(["0"]);
    client.moves.pickCaptain(0, "Sloop");
    expect(Object.keys(stateOf(client).G.ships).sort()).toEqual(["0", "1", "2"]);
    expect(nextTurns(client, 3)).toEqual(["1", "2", "0"]);
  });

  it("a seat out of captains is passed over for good, and the turns never stall", () => {
    const client = startGame(threeSeats([true, false, true]), { captainDeck: [] });
    client.moves.attackShip("1");
    fireOnce(client);

    expect(stateOf(client).G.lostShips?.["1"]?.eliminated).toBe(true);
    expect(current(client)).toBe("2");
    expect(nextTurns(client, 4)).toEqual(["0", "2", "0", "2"]);
    expect(stateOf(client).ctx.gameover).toBeUndefined();
  });

  it("a fight that starts on the turn after an out seat still passes the turn on by one", () => {
    const client = startGame(threeSeats([true, false, true]), { captainDeck: [] });
    client.moves.attackShip("1");
    fireOnce(client);
    expect(current(client)).toBe("2");
    client.moves.attackShip("0");
    boardOnce(client);

    expect(current(client)).toBe("0");
    expect(nextTurns(client, 2)).toEqual(["2", "0"]);
  });

  it("a fight with an NPC ends the attacker's turn too: the next seat plays", () => {
    const client = startGame(threeSeats(), { npcs: { merchant: merchant(-1, 0) } });
    client.moves.attackNPC("merchant");
    expect(current(client)).toBe("0");
    fireOnce(client);

    expect(stateOf(client).G.npcs.merchant).toBeUndefined();
    expect(current(client)).toBe("1");
    expect(nextTurns(client, 3)).toEqual(["2", "0", "1"]);
  });

  it("solo: a fight with an NPC ends the turn, and the next is the one seat's again", () => {
    const client = startGame({ "0": ship(0, 0, "blackbeard", true) }, { npcs: { merchant: merchant(-1, 0) } });
    const turn = stateOf(client).ctx.turn;
    client.moves.attackNPC("merchant");
    expect(current(client)).toBe("0");
    fireOnce(client);

    const { ctx } = stateOf(client);
    expect(ctx).toMatchObject({ currentPlayer: "0", phase: "main" });
    expect(ctx.turn).toBeGreaterThan(turn);
    expect(stateOf(client).G.movesUsed).toBe(0);
  });
});
