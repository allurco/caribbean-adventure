import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexEquals, hexGrid, neighbors } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, Nation, NPCShip, ShipState } from "./types";
import { Caribbean, withGeneratedMap, withHotseatView } from "./Game";
import { findHomeStart } from "./captains";
import { generateMapFor } from "./mapRequest";
import { createShipState } from "./economy";
import { fightToTheEnd } from "../testSupport/combatSteps";
import { silenceInvalidMoveLogs } from "../testSupport/silenceInvalidMoveLogs";

// These tests send refused moves on purpose; boardgame.io logs each one.
silenceInvalidMoveLogs();

/**
 * A ship lost in combat, played through a real Caribbean client (#265): the
 * turn never sticks on a seat with no ship, and on that seat's next turn
 * the player picks a new captain and sails from their home port.
 */

const PORT = hex(-4, 0);
const DOCK = hex(-3, 0);

/** Open water, with one English port on the west side. */
const cells: MapCell[] = hexGrid(5).map((h) =>
  hexEquals(h, PORT)
    ? { hex: h, terrain: "island", hasPort: true, nation: "England", portName: "Port Royal", dockingHex: DOCK, elevation: 1 }
    : { hex: h, terrain: "water", hasPort: false, elevation: 0 }
);

const captain = (id: string, nation: Nation = "England"): Captain => ({ id, name: id, nation, ability: "" });

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

function flotilla(q: number, r: number): NPCShip {
  return {
    id: "flotilla",
    position: hex(q, r),
    cargo: { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 },
    gold: 0,
    shipClass: "Frigate",
    stats: {
      maneuverability: 0,
      scouting: 1,
      cannons: 20,
      crew: { current: 20, max: 20 },
      hull: { current: 40, max: 40 },
      cargo: 8,
      shallowDraft: false,
    },
    damage: { hull: 0, crew: 0, masts: 0 },
    nation: "Spain",
    aiBehavior: "HUNTER",
    destinationPortHex: PORT,
    spawnPortHex: PORT,
    isIdentified: false,
    bounty: 0,
    role: "FLOTILLA",
    huntingTargetId: null,
  };
}

function startGame(ships: Record<string, ShipState>, extra: Partial<CaribbeanState> = {}) {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed: "captain-death-265",
    phases: {
      main: { ...(Caribbean.phases?.main ?? {}), start: true },
      combat: Caribbean.phases!.combat!,
    },
    setup: () => ({
      cells,
      ships,
      mapSize: "small",
      captainDeck: [captain("drake"), captain("morgan"), captain("hein", "Netherlands")],
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

/** Play cannon fire through to the end of the combat. */
function fireOnce(client: TestClient): void {
  fightToTheEnd(client);
  expect(stateOf(client).G.combat).toBeUndefined();
}

describe("a ship sunk in combat (#265)", () => {
  it("a sunk defender's turn comes round: they pick a captain and sail from their home port", () => {
    const client = startGame({ "0": ship(0, 0, "blackbeard", true), "1": ship(1, 0, "surcouf", false) });
    client.moves.attackShip("1");
    fireOnce(client);
    expect(stateOf(client).G.ships["1"]).toBeUndefined();

    // The fight ended the attacker's turn: the defender's comes next (#284)
    const { G, ctx } = stateOf(client);
    expect(ctx.currentPlayer).toBe("1");
    expect(ctx.phase).toBe("main");
    expect(G.draftHands["1"]).toEqual([captain("drake"), captain("morgan")]);

    client.moves.pickCaptain(1, "Sloop");
    const picked = stateOf(client).G.ships["1"];
    expect(picked.captain).toEqual(captain("morgan"));
    expect(hexEquals(picked.position, DOCK)).toBe(true);

    client.moves.moveShip(-2, 0);
    expect(hexEquals(stateOf(client).G.ships["1"].position, hex(-2, 0))).toBe(true);
    expect(stateOf(client).ctx.currentPlayer).toBe("1");
  });

  it("an attacker sunk on their own turn passes the turn on, then picks on their next", () => {
    const client = startGame({ "0": ship(0, 0, "blackbeard", false), "1": ship(1, 0, "surcouf", true) });
    client.moves.attackShip("1");
    fireOnce(client);

    expect(stateOf(client).G.ships["0"]).toBeUndefined();
    expect(stateOf(client).ctx.currentPlayer).toBe("1");
    expect(stateOf(client).G.draftHands["1"] ?? []).toEqual([]);

    client.moves.moveShip(2, 0);
    expect(hexEquals(stateOf(client).G.ships["1"].position, hex(2, 0))).toBe(true);

    client.events.endTurn!();
    expect(stateOf(client).ctx.currentPlayer).toBe("0");
    client.moves.pickCaptain(0, "Flute");
    expect(stateOf(client).G.ships["0"].captain).toEqual(captain("drake"));
    client.moves.moveShip(-2, 0);
    expect(hexEquals(stateOf(client).G.ships["0"].position, hex(-2, 0))).toBe(true);
  });

  it("an attacker sunk by a flotilla passes the turn on, and the NPCs still sail", () => {
    const client = startGame(
      { "0": ship(0, 0, "blackbeard", false), "1": ship(4, 0, "surcouf", true) },
      { npcs: { flotilla: flotilla(1, 0) } }
    );
    client.moves.attackNPC("flotilla");
    fireOnce(client);

    expect(stateOf(client).G.ships["0"]).toBeUndefined();
    expect(stateOf(client).ctx.currentPlayer).toBe("1");
    client.events.endTurn!();
    expect(stateOf(client).ctx.currentPlayer).toBe("0");
    expect(stateOf(client).G.draftHands["0"]).toHaveLength(2);
  });

  it("a defender the ambush sinks never fires back, though it could have sunk the attacker (#346)", () => {
    const attacker = ship(0, 0, "blackbeard", true);
    const defender = ship(1, 0, "surcouf", true);
    attacker.stats!.hull = { current: 1, max: 1 };
    defender.stats!.hull = { current: 1, max: 1 };
    const client = startGame({ "0": attacker, "1": defender });
    client.moves.attackShip("1");
    fireOnce(client);

    expect(Object.keys(stateOf(client).G.ships)).toEqual(["0"]);
    expect(stateOf(client).G.ships["0"].stats!.hull.current).toBe(1);
    expect(stateOf(client).ctx.currentPlayer).toBe("1");
  });

  it("keeps the player's glory and stashed gold across the new captain", () => {
    const loser = ship(1, 0, "surcouf", false);
    loser.score = 3;
    loser.stashedGold = 40;
    const client = startGame({ "0": ship(0, 0, "blackbeard", true), "1": loser });
    client.moves.attackShip("1");
    fireOnce(client);
    client.moves.pickCaptain(0, "Sloop");
    expect(stateOf(client).G.ships["1"]).toMatchObject({ score: 3, stashedGold: 40 });
  });

  it("refuses every ship move before the pick, and keeps the hand if the turn ends unpicked", () => {
    const client = startGame({ "0": ship(0, 0, "blackbeard", true), "1": ship(1, 0, "surcouf", false) });
    client.moves.attackShip("1");
    fireOnce(client);
    expect(stateOf(client).ctx.currentPlayer).toBe("1");
    const before = stateOf(client).G;
    client.moves.moveShip(2, 0);
    client.moves.stashGold(10);
    client.moves.juryRig();
    expect(stateOf(client).G).toEqual(before);

    client.events.endTurn!();
    client.events.endTurn!();
    expect(stateOf(client).ctx.currentPlayer).toBe("1");
    expect(stateOf(client).G.draftHands["1"]).toEqual([captain("drake"), captain("morgan")]);
  });
});

describe("a solo player's only ship sunk (#265, #278)", () => {
  /** One seat, sunk on its own turn by the flotilla it attacked. */
  function sunkSolo() {
    const client = startGame({ "0": ship(0, 0, "blackbeard", false) }, { npcs: { flotilla: flotilla(1, 0) } });
    client.moves.attackNPC("flotilla");
    fireOnce(client);
    return client;
  }

  it("the turn comes straight back to the one seat, its new captain's hand dealt", () => {
    const client = sunkSolo();
    const { G, ctx } = stateOf(client);
    expect(G.ships["0"]).toBeUndefined();
    expect(ctx.phase).toBe("main");
    expect(ctx.currentPlayer).toBe("0");
    expect(ctx.gameover).toBeUndefined();
    expect(G.draftHands["0"]).toEqual([captain("drake"), captain("morgan")]);
  });

  it("picks a new captain and sails from the home port, turn after turn", () => {
    const client = sunkSolo();
    client.moves.pickCaptain(0, "Sloop");
    expect(stateOf(client).G.ships["0"].captain).toEqual(captain("drake"));
    expect(hexEquals(stateOf(client).G.ships["0"].position, DOCK)).toBe(true);
    client.moves.moveShip(-2, 0);
    expect(hexEquals(stateOf(client).G.ships["0"].position, hex(-2, 0))).toBe(true);

    const turn = stateOf(client).ctx.turn;
    client.events.endTurn!();
    client.events.endTurn!();
    expect(stateOf(client).ctx).toMatchObject({ currentPlayer: "0", phase: "main", turn: turn + 2 });
  });

  it("does not stall if the turn ends before the pick: the hand waits for the next", () => {
    const client = sunkSolo();
    const turn = stateOf(client).ctx.turn;
    client.events.endTurn!();
    const { G, ctx } = stateOf(client);
    expect(ctx).toMatchObject({ currentPlayer: "0", phase: "main", turn: turn + 1 });
    expect(G.draftHands["0"]).toEqual([captain("drake"), captain("morgan")]);
    client.moves.pickCaptain(1, "Flute");
    expect(stateOf(client).G.ships["0"].captain).toEqual(captain("morgan"));
  });
});

describe("out of captains (#265)", () => {
  it("a sunk player with no captain left to deal is out: their turns are skipped for good", () => {
    const client = startGame({ "0": ship(0, 0, "blackbeard", true), "1": ship(1, 0, "surcouf", false) }, { captainDeck: [] });
    client.moves.attackShip("1");
    fireOnce(client);
    client.events.endTurn!();

    const { G, ctx } = stateOf(client);
    expect(G.lostShips?.["1"]?.eliminated).toBe(true);
    expect(ctx.currentPlayer).toBe("0");
    expect(ctx.gameover).toBeUndefined();
    client.events.endTurn!();
    client.events.endTurn!();
    expect(stateOf(client).ctx.currentPlayer).toBe("0");
    expect(stateOf(client).G.draftHands["1"] ?? []).toEqual([]);
  });

  it("when every seat is out, the game ends and the most glory wins", () => {
    // Seat 0 sinks seat 1, then is sunk by the flotilla it attacks: no captain is left for either.
    const attacker = ship(0, 0, "blackbeard", true);
    attacker.stats!.hull = { current: 1, max: 1 };
    const defender = ship(1, 0, "surcouf", false);
    defender.score = 2;
    const client = startGame({ "0": attacker, "1": defender }, { captainDeck: [], npcs: { flotilla: flotilla(-1, 0) } });
    client.moves.attackShip("1");
    fireOnce(client);
    expect(stateOf(client).G.lostShips?.["1"]?.eliminated).toBe(true);
    expect(stateOf(client).ctx.currentPlayer).toBe("0");
    expect(stateOf(client).ctx.gameover).toBeUndefined();

    client.moves.attackNPC("flotilla");
    fireOnce(client);
    expect(stateOf(client).ctx.gameover).toMatchObject({ winner: "1", score: 2 });
  });

  it("solo: the player picks the last captain, and is out with an empty deck, which ends the game", () => {
    const solo = startGame({ "0": ship(0, 0, "blackbeard", false) }, { captainDeck: [captain("drake")], npcs: { flotilla: flotilla(1, 0) } });
    solo.moves.attackNPC("flotilla");
    fireOnce(solo);
    expect(stateOf(solo).ctx.currentPlayer).toBe("0");
    expect(stateOf(solo).G.draftHands["0"]).toEqual([captain("drake")]);
    solo.moves.pickCaptain(0, "Sloop");
    expect(stateOf(solo).G.ships["0"].captain).toEqual(captain("drake"));

    const out = startGame({ "0": ship(0, 0, "blackbeard", false) }, { captainDeck: [], npcs: { flotilla: flotilla(1, 0) } });
    out.moves.attackNPC("flotilla");
    fireOnce(out);
    expect(stateOf(out).ctx.gameover).toMatchObject({ winner: "0" });
  });
});

describe("a real solo match out of captains (#265, #278)", () => {
  it("drafts, loses its ship until no captain is left, goes out, and the game ends", () => {
    const request = { mapSize: "small", mapSeed: 7 } as const;
    const real = withGeneratedMap(Caribbean, { ...request, ...generateMapFor(request) });
    // The real one-seat setup, its deck emptied but for the captain the draft returns, and a heavy flotilla waiting off the first captain's home port
    const game: Game<CaribbeanState> = {
      ...real,
      seed: "solo-out-265",
      setup: (context, setupData) => {
        const G = real.setup!(context, setupData);
        const start = findHomeStart(G.draftHands["0"][0].nation, G.cells, [], G.regions, G.wrap)!;
        const water = neighbors(start.position).find((h) =>
          G.cells.some((c) => hexEquals(c.hex, h) && c.terrain === "water")
        )!;
        return { ...G, captainDeck: [], npcs: { flotilla: flotilla(water.q, water.r) } };
      },
    };
    const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: 1 });
    client.start();
    expect(stateOf(client).ctx.phase).toBe("draft");
    client.moves.pickCaptain(0, "Sloop");
    expect(stateOf(client).ctx.phase).toBe("main");

    /** Attack the flotilla and fire until the fight is over. */
    const fight = () => {
      client.moves.attackNPC("flotilla");
      expect(stateOf(client).G.combat).toBeDefined();
      fightToTheEnd(client);
      expect(stateOf(client).G.ships["0"]).toBeUndefined();
    };

    // The captain not picked in the draft went back into the deck: the one hand left
    fight();
    expect(stateOf(client).ctx.gameover).toBeUndefined();
    expect(stateOf(client).G.draftHands["0"]).toHaveLength(1);
    client.moves.pickCaptain(0, "Sloop");
    expect(stateOf(client).G.ships["0"]).toBeDefined();

    // Sunk again, with no captain left to deal: out, and the game is over
    fight();
    const { G, ctx } = stateOf(client);
    expect(G.lostShips?.["0"]?.eliminated).toBe(true);
    expect(ctx.gameover).toMatchObject({ winner: "0" });
  });
});

describe("the opening draft (#265)", () => {
  it("returns the captains not picked to the bottom of the deck: they are alive", () => {
    const game: Game<CaribbeanState> = {
      ...Caribbean,
      setup: () => ({
        cells,
        ships: { "0": createShipState(hex(0, 0)), "1": createShipState(hex(0, 0)) },
        mapSize: "small",
        captainDeck: [captain("hein", "Netherlands")],
        draftHands: { "0": [captain("drake"), captain("morgan")], "1": [captain("surcouf", "France"), captain("ducasse", "France")] },
        floatingLoot: [],
        npcs: {},
        npcIdCounter: 0,
        wrap: null,
      }),
    };
    const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: 2 });
    client.start();
    client.moves.pickCaptain(0, "Sloop");
    client.moves.pickCaptain(1, "Flute");
    expect(stateOf(client).ctx.phase).toBe("main");
    expect(stateOf(client).G.captainDeck.map((c) => c.id)).toEqual(["hein", "morgan", "surcouf"]);
  });
});
