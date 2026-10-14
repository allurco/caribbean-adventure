import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, Nation, NPCRole, NPCShip, ShipState } from "./types";
import { Caribbean } from "./Game";
import { createShipState } from "./economy";
import { isBannedAtPort, isPlayerPirate } from "./reputation";

/**
 * Turning pirate and the per-flag bounty on pirates (#201), played through a
 * real Caribbean client the way players do. Ships are rigged so each fight
 * has one outcome: the side with guns sinks the side without, whose hull is
 * a single point, and the game is seeded so the dice repeat.
 */

const water: MapCell[] = hexGrid(5).map((h) => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 }));

function captain(nation: Nation): Captain {
  return { id: `captain-${nation}`, name: `${nation} captain`, nation, ability: "" };
}

interface Rig {
  nation?: Nation;
  guns?: boolean;
  hull?: number;
}

/** A player ship. With guns it wins every seamanship roll and fires twenty. */
function ship(q: number, r: number, { nation, guns = true, hull = 40 }: Rig = {}): ShipState {
  const s = createShipState(hex(q, r), "Galleon");
  s.stats!.maneuverability = guns ? 20 : 0;
  s.stats!.cannons = guns ? 20 : 0;
  s.stats!.crew = { current: 20, max: 20 };
  s.stats!.hull = { current: hull, max: hull };
  if (nation) s.captain = captain(nation);
  return s;
}

/** A merchant without guns that sinks to one hit, or a flotilla with twenty guns. */
function npc(id: string, role: NPCRole, nation: Nation, q: number, r: number): NPCShip {
  const armed = role === "FLOTILLA";
  return {
    id,
    position: hex(q, r),
    cargo: { Wood: 2, Sugar: 0, Rum: 0, Spice: 0 },
    gold: 10,
    shipClass: "Flute",
    stats: {
      maneuverability: 0,
      scouting: 1,
      cannons: armed ? 20 : 0,
      crew: { current: 20, max: 20 },
      hull: armed ? { current: 40, max: 40 } : { current: 1, max: 1 },
      cargo: 8,
      shallowDraft: true,
    },
    damage: { hull: 0, crew: 0, masts: 0 },
    nation,
    aiBehavior: armed ? "HUNTER" : "MERCHANT_ROUTE",
    destinationPortHex: hex(5, -5),
    spawnPortHex: hex(-5, 5),
    isIdentified: false,
    bounty: 30,
    role,
    huntingTargetId: null,
  };
}

function startGame(ships: Record<string, ShipState>, extra: Partial<CaribbeanState> = {}) {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed: "pirates-201",
    phases: {
      main: { ...(Caribbean.phases?.main ?? {}), start: true },
      combat: Caribbean.phases!.combat!,
    },
    setup: () => ({
      cells: water,
      ships,
      mapSize: "small",
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
      pirates: {},
      ...extra,
    }),
  };
  const client = Client<CaribbeanState>({ game, numPlayers: Object.keys(ships).length });
  client.start();
  return client;
}

type TestClient = ReturnType<typeof startGame>;

const stateOf = (client: TestClient): CaribbeanState => client.getState()!.G;

/** Hand the turn round until it is `playerId`'s. */
function actAs(client: TestClient, playerId: string): void {
  for (let i = 0; i < 6 && client.getState()!.ctx.currentPlayer !== playerId; i++) {
    client.events.endTurn!();
  }
  expect(client.getState()!.ctx.currentPlayer).toBe(playerId);
}

/** Play one exchange of cannon fire through to the end of the combat. */
function fireOnce(client: TestClient): void {
  client.moves.rollSeamanship();
  client.moves.chooseCombatAction("fire");
  client.moves.rollCannons();
  client.moves.applyResolution();
  expect(stateOf(client).combat).toBeUndefined();
}

function sinkPlayer(client: TestClient, attackerId: string, targetId: string): void {
  actAs(client, attackerId);
  client.moves.attackShip(targetId);
  fireOnce(client);
}

describe("turning pirate (#201)", () => {
  it("attacking a merchant adds bounty but does not turn the player pirate", () => {
    const client = startGame(
      { "0": ship(0, 0, { nation: "France" }), "1": ship(4, 0, { nation: "England" }) },
      { npcs: { merchant: npc("merchant", "MERCHANT", "Spain", 1, 0) } }
    );
    client.moves.attackNPC("merchant");
    client.moves.rollSeamanship();
    client.moves.chooseCombatAction("flee");

    expect(stateOf(client).ships["0"].bounties.Spain).toBe(30);
    expect(isPlayerPirate(stateOf(client), "0")).toBe(false);
    expect(stateOf(client).pirates).toEqual({});
  });

  it("sinking a merchant turns the player pirate, and only that player", () => {
    const client = startGame(
      { "0": ship(0, 0, { nation: "France" }), "1": ship(4, 0, { nation: "England" }) },
      { npcs: { merchant: npc("merchant", "MERCHANT", "Spain", 1, 0) } }
    );
    client.moves.attackNPC("merchant");
    fireOnce(client);

    expect(stateOf(client).npcs.merchant).toBeUndefined();
    expect(isPlayerPirate(stateOf(client), "0")).toBe(true);
    expect(stateOf(client).pirates).toEqual({ "0": { turn: expect.any(Number), cause: "sink" } });
    expect(isPlayerPirate(stateOf(client), "1")).toBe(false);
  });

  it("boarding a merchant turns the player pirate, and only that player", () => {
    const client = startGame(
      { "0": ship(0, 0, { nation: "France" }), "1": ship(4, 0, { nation: "England" }) },
      { npcs: { merchant: npc("merchant", "MERCHANT", "Spain", 1, 0) } }
    );
    client.moves.attackNPC("merchant");
    client.moves.rollSeamanship();
    client.moves.chooseCombatAction("board");

    expect(stateOf(client).npcs.merchant).toBeUndefined();
    expect(stateOf(client).pirates).toEqual({ "0": { turn: expect.any(Number), cause: "board" } });
    expect(isPlayerPirate(stateOf(client), "1")).toBe(false);
  });

  it("stays a pirate after their ship is sunk", () => {
    const client = startGame(
      {
        "0": ship(0, 0, { nation: "France", hull: 1 }),
        "1": ship(-1, 0, { nation: "England" }),
      },
      { npcs: { merchant: npc("merchant", "MERCHANT", "Spain", 1, 0) } }
    );
    client.moves.attackNPC("merchant");
    fireOnce(client);
    expect(isPlayerPirate(stateOf(client), "0")).toBe(true);

    sinkPlayer(client, "1", "0");

    expect(stateOf(client).ships["0"]).toBeUndefined();
    expect(isPlayerPirate(stateOf(client), "0")).toBe(true);
  });

  it("keeps G JSON-serialisable through turning pirate", () => {
    const client = startGame(
      { "0": ship(0, 0, { nation: "France" }), "1": ship(4, 0, { nation: "England" }) },
      { npcs: { merchant: npc("merchant", "MERCHANT", "Spain", 1, 0) } }
    );
    client.moves.attackNPC("merchant");
    fireOnce(client);

    const G = stateOf(client);
    // Compared as text: hex(0, 0) carries a -0 that JSON writes as 0.
    const json = JSON.stringify(G);
    expect(JSON.stringify(JSON.parse(json))).toBe(json);
    expect(JSON.parse(json).pirates).toEqual(G.pirates);
  });

  it("leaves port bans as they were: per nation, by bounty", () => {
    const client = startGame(
      { "0": ship(0, 0, { nation: "France" }), "1": ship(4, 0, { nation: "England" }) },
      { npcs: { merchant: npc("merchant", "MERCHANT", "Spain", 1, 0) } }
    );
    client.moves.attackNPC("merchant");
    fireOnce(client);
    const pirate = stateOf(client).ships["0"];

    expect(isPlayerPirate(stateOf(client), "0")).toBe(true);
    expect(isBannedAtPort(pirate, "Spain")).toBe(true);
    expect(isBannedAtPort(pirate, "England")).toBe(false);
    expect(isBannedAtPort(pirate, "Pirate")).toBe(false);
  });
});

