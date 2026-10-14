import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, Nation, NPCRole, NPCShip, PirateRecord, ShipState } from "./types";
import { Caribbean, withHotseatView } from "./Game";
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
  bounties?: Partial<Record<Nation, number>>;
}

/** A player ship. With guns it wins every seamanship roll and fires twenty. */
function ship(q: number, r: number, { nation, guns = true, hull = 40, bounties = {} }: Rig = {}): ShipState {
  const s = createShipState(hex(q, r), "Galleon");
  s.stats!.maneuverability = guns ? 20 : 0;
  s.stats!.cannons = guns ? 20 : 0;
  s.stats!.crew = { current: 20, max: 20 };
  s.stats!.hull = { current: hull, max: hull };
  if (nation) s.captain = captain(nation);
  Object.assign(s.bounties, bounties);
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

const PIRATE: PirateRecord = { turn: 0, cause: "sink" };

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
      bountyClaims: [],
      ...extra,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: Object.keys(ships).length });
  client.start();
  return client;
}

type TestClient = ReturnType<typeof startGame>;

const stateOf = (client: TestClient): CaribbeanState => client.getState()!.G;

const goldOf = (client: TestClient): Record<string, number> =>
  Object.fromEntries(Object.entries(stateOf(client).ships).map(([id, s]) => [id, s.gold]));

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

  it("stays a pirate after their bounty is collected and their ship is sunk", () => {
    const client = startGame(
      {
        "0": ship(0, 0, { nation: "France", hull: 1, bounties: { England: 25 } }),
        "1": ship(-1, 0, { nation: "England" }),
      },
      { npcs: { merchant: npc("merchant", "MERCHANT", "Spain", 1, 0) } }
    );
    client.moves.attackNPC("merchant");
    fireOnce(client);
    expect(isPlayerPirate(stateOf(client), "0")).toBe(true);

    sinkPlayer(client, "1", "0");

    expect(stateOf(client).ships["0"]).toBeUndefined();
    expect(stateOf(client).bountyClaims).toHaveLength(1);
    expect(isPlayerPirate(stateOf(client), "0")).toBe(true);
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

describe("the bounty on a pirate, per flag (#201)", () => {
  const pirateBounties = { England: 25, France: 7, Netherlands: 10 };

  it("pays an England captor only England's bounty, in gold, and logs the claim", () => {
    const client = startGame(
      {
        "0": ship(0, 0, { nation: "England" }),
        "1": ship(1, 0, { nation: "France", guns: false, hull: 1, bounties: pirateBounties }),
        "2": ship(4, 0, { nation: "Spain" }),
      },
      { pirates: { "1": PIRATE } }
    );
    const before = goldOf(client);
    sinkPlayer(client, "0", "1");

    expect(stateOf(client).ships["1"]).toBeUndefined();
    expect(goldOf(client)).toEqual({ "0": before["0"] + 25, "2": before["2"] });
    expect(stateOf(client).bountyClaims).toEqual([
      { captorId: "0", pirateId: "1", nation: "England", gold: 25, turn: expect.any(Number) },
    ]);
    expect(isPlayerPirate(stateOf(client), "1")).toBe(true);
  });

  it("pays a defender who sinks the pirate that attacked them", () => {
    const client = startGame(
      {
        "0": ship(0, 0, { nation: "France", guns: false, hull: 1, bounties: pirateBounties }),
        "1": ship(1, 0, { nation: "Netherlands" }),
      },
      { pirates: { "0": PIRATE } }
    );
    const before = goldOf(client);
    sinkPlayer(client, "0", "1");

    expect(stateOf(client).ships["0"]).toBeUndefined();
    expect(goldOf(client)).toEqual({ "1": before["1"] + 10 });
    expect(stateOf(client).bountyClaims).toEqual([
      { captorId: "1", pirateId: "0", nation: "Netherlands", gold: 10, turn: expect.any(Number) },
    ]);
  });

  it("pays a pirate captor nothing: they fly no nation's flag", () => {
    const client = startGame(
      {
        "0": ship(0, 0, { nation: "England" }),
        "1": ship(1, 0, { nation: "France", guns: false, hull: 1, bounties: pirateBounties }),
      },
      { pirates: { "0": PIRATE, "1": PIRATE } }
    );
    const before = goldOf(client);
    sinkPlayer(client, "0", "1");

    expect(stateOf(client).ships["1"]).toBeUndefined();
    expect(goldOf(client)).toEqual({ "0": before["0"] });
    expect(stateOf(client).bountyClaims).toEqual([]);
  });

  it("pays nothing for a non-pirate, even one with a bounty from attacking a merchant", () => {
    const client = startGame({
      "0": ship(0, 0, { nation: "England" }),
      "1": ship(1, 0, { nation: "France", guns: false, hull: 1, bounties: pirateBounties }),
    });
    const before = goldOf(client);
    sinkPlayer(client, "0", "1");

    expect(stateOf(client).ships["1"]).toBeUndefined();
    expect(goldOf(client)).toEqual({ "0": before["0"] });
    expect(stateOf(client).bountyClaims).toEqual([]);
  });

  it("pays no one when a flotilla sinks a pirate", () => {
    const client = startGame(
      {
        "0": ship(0, 0, { nation: "France", hull: 1, bounties: pirateBounties }),
        "1": ship(4, 0, { nation: "England" }),
      },
      { pirates: { "0": PIRATE }, npcs: { flotilla: npc("flotilla", "FLOTILLA", "England", 1, 0) } }
    );
    const before = goldOf(client);
    client.moves.attackNPC("flotilla");
    fireOnce(client);

    expect(stateOf(client).ships["0"]).toBeUndefined();
    expect(goldOf(client)).toEqual({ "1": before["1"] });
    expect(stateOf(client).bountyClaims).toEqual([]);
    expect(isPlayerPirate(stateOf(client), "0")).toBe(true);
  });

  it("keeps G JSON-serialisable through turning pirate and a claim", () => {
    const client = startGame(
      {
        "0": ship(0, 0, { nation: "France", hull: 1, bounties: { England: 25 } }),
        "1": ship(-1, 0, { nation: "England" }),
      },
      { npcs: { merchant: npc("merchant", "MERCHANT", "Spain", 1, 0) } }
    );
    client.moves.attackNPC("merchant");
    fireOnce(client);
    sinkPlayer(client, "1", "0");

    const G = stateOf(client);
    expect(G.bountyClaims).toHaveLength(1);
    // Compared as text: hex(0, 0) carries a -0 that JSON writes as 0.
    const json = JSON.stringify(G);
    expect(JSON.stringify(JSON.parse(json))).toBe(json);
    expect(JSON.parse(json).pirates).toEqual(G.pirates);
    expect(JSON.parse(json).bountyClaims).toEqual(G.bountyClaims);
  });
});
