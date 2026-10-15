import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexEquals, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, Nation, NPCShip, ShipState } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { createShipState } from "./economy";

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

/** Play one exchange of cannon fire through to the end of the combat. */
function fireOnce(client: TestClient): void {
  client.moves.rollSeamanship();
  client.moves.chooseCombatAction("fire");
  client.moves.rollCannons();
  client.moves.applyResolution();
  expect(stateOf(client).G.combat).toBeUndefined();
}

describe("a ship sunk in combat (#265)", () => {
  it("a sunk defender's turn comes round: they pick a captain and sail from their home port", () => {
    const client = startGame({ "0": ship(0, 0, "blackbeard", true), "1": ship(1, 0, "surcouf", false) });
    client.moves.attackShip("1");
    fireOnce(client);
    expect(stateOf(client).G.ships["1"]).toBeUndefined();
    expect(stateOf(client).ctx.currentPlayer).toBe("0");

    client.events.endTurn!();
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

  it("when both ships sink, the turn passes to the defender, who picks first", () => {
    const attacker = ship(0, 0, "blackbeard", true);
    const defender = ship(1, 0, "surcouf", true);
    attacker.stats!.hull = { current: 1, max: 1 };
    defender.stats!.hull = { current: 1, max: 1 };
    const client = startGame({ "0": attacker, "1": defender });
    client.moves.attackShip("1");
    fireOnce(client);

    expect(stateOf(client).G.ships).toEqual({});
    expect(stateOf(client).ctx.currentPlayer).toBe("1");
    client.moves.pickCaptain(0, "Sloop");
    client.events.endTurn!();
    expect(stateOf(client).ctx.currentPlayer).toBe("0");
    client.moves.pickCaptain(0, "Sloop");
    expect(Object.keys(stateOf(client).G.ships).sort()).toEqual(["0", "1"]);
  });

  it("keeps the player's glory and stashed gold across the new captain", () => {
    const loser = ship(1, 0, "surcouf", false);
    loser.score = 3;
    loser.stashedGold = 40;
    const client = startGame({ "0": ship(0, 0, "blackbeard", true), "1": loser });
    client.moves.attackShip("1");
    fireOnce(client);
    client.events.endTurn!();
    client.moves.pickCaptain(0, "Sloop");
    expect(stateOf(client).G.ships["1"]).toMatchObject({ score: 3, stashedGold: 40 });
  });

  it("refuses every ship move before the pick, and keeps the hand if the turn ends unpicked", () => {
    const client = startGame({ "0": ship(0, 0, "blackbeard", true), "1": ship(1, 0, "surcouf", false) });
    client.moves.attackShip("1");
    fireOnce(client);
    client.events.endTurn!();
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
