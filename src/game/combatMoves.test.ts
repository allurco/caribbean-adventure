import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, Mission, NPCRole, NPCShip, ShipState } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { createShipState } from "./economy";
import { silenceInvalidMoveLogs } from "../testSupport/silenceInvalidMoveLogs";

// The stage test sends refused moves on purpose; boardgame.io logs each one.
silenceInvalidMoveLogs();

/**
 * The combat phase's paths no other suite plays through a client (#345):
 * the NPC's own choice when it wins the draw, boarding a flotilla, a ship
 * left derelict, and the missions a fight settles. Each fight is made
 * certain by its numbers: a manoeuvrability of 20 wins every draw and every
 * flight, twenty guns always hit, and no guns never do.
 */

const cells: MapCell[] = hexGrid(5).map((h) => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 }));

const captain = (id: string): Captain => ({ id, name: id, nation: "England", ability: "" });

interface Rig {
  maneuverability?: number;
  cannons?: number;
  crew?: number;
  hull?: number;
  upgrades?: string[];
}

/** A player ship at (q, r), rigged as asked. */
function ship(q: number, r: number, rig: Rig = {}): ShipState {
  const s = createShipState(hex(q, r), "Galleon");
  s.stats!.maneuverability = rig.maneuverability ?? 0;
  s.stats!.cannons = rig.cannons ?? 0;
  s.stats!.crew = { current: rig.crew ?? 20, max: rig.crew ?? 20 };
  s.stats!.hull = { current: rig.hull ?? 40, max: rig.hull ?? 40 };
  s.upgrades = rig.upgrades ?? [];
  s.captain = captain(`captain-${q}-${r}`);
  return s;
}

/** An NPC beside seat 0, rigged as asked. */
function npc(role: NPCRole, rig: Rig = {}): NPCShip {
  return {
    id: "foe",
    position: hex(1, 0),
    cargo: { Wood: 1, Sugar: 2, Rum: 3, Spice: 0 },
    gold: 17,
    shipClass: "Flute",
    stats: {
      maneuverability: rig.maneuverability ?? 0,
      scouting: 1,
      cannons: rig.cannons ?? 0,
      crew: { current: rig.crew ?? 20, max: rig.crew ?? 20 },
      hull: { current: rig.hull ?? 40, max: rig.hull ?? 40 },
      cargo: 8,
      shallowDraft: false,
    },
    damage: { hull: 0, crew: 0, masts: 0 },
    nation: "Spain",
    aiBehavior: role === "MERCHANT" ? "MERCHANT_ROUTE" : "HUNTER",
    destinationPortHex: hex(-5, 0),
    spawnPortHex: hex(5, 0),
    isIdentified: false,
    bounty: 0,
    role,
    huntingTargetId: null,
  };
}

function startGame(ships: Record<string, ShipState>, npcs: Record<string, NPCShip> = {}) {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed: "combat-moves-345",
    phases: {
      main: { ...(Caribbean.phases?.main ?? {}), start: true },
      combat: Caribbean.phases!.combat!,
    },
    setup: () => ({
      cells,
      ships,
      mapSize: "small",
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs,
      npcIdCounter: 0,
      wrap: null,
      pirates: {},
      bountyClaims: [],
      movesUsed: 0,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: Object.keys(ships).length });
  client.start();
  return client;
}

type TestClient = ReturnType<typeof startGame>;
const G = (client: TestClient) => client.getState()!.G;

function mission(type: Mission["type"], extra: Partial<Mission> = {}): Mission {
  return {
    id: "m-1",
    title: type,
    description: type,
    type,
    reward: { gold: 50, glory: 2 },
    status: "ACTIVE",
    ...extra,
  };
}

describe("an NPC that wins the draw picks its own action (#345)", () => {
  it("outgunned, it flees: the fight goes to the flight, and the faster NPC gets clean away, unharmed", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 4 }) }, { foe: npc("MERCHANT", { maneuverability: 20 }) });
    client.moves.attackNPC("foe");
    client.moves.rollSeamanship();
    expect(G(client).combat).toMatchObject({ seamanshipWinner: "foe", actionChosen: "flee", stage: "fleeAttempt" });

    client.moves.rollFleeAttempt();
    expect(G(client).combat).toBeUndefined();
    expect(client.getState()!.ctx.phase).toBe("main");
    expect(G(client).floatingLoot).toEqual([]);
  });

  it("not outgunned, it fires: the fight goes straight to the cannons", () => {
    const client = startGame(
      { "0": ship(0, 0, { cannons: 2 }) },
      { foe: npc("FLOTILLA", { maneuverability: 20, cannons: 4 }) }
    );
    client.moves.attackNPC("foe");
    client.moves.rollSeamanship();
    expect(G(client).combat).toMatchObject({ seamanshipWinner: "foe", actionChosen: "fire", stage: "cannons" });
  });
});

describe("boarding an NPC (#345)", () => {
  it("a flotilla: its cargo and gold come aboard, no bounty is added, and it is gone", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 20 }) }, { foe: npc("FLOTILLA") });
    client.moves.attackNPC("foe");
    client.moves.rollSeamanship();
    const goldBefore = G(client).ships["0"].gold;
    client.moves.chooseCombatAction("board");

    const after = G(client);
    expect(after.combat).toBeUndefined();
    expect(after.npcs.foe).toBeUndefined();
    expect(after.ships["0"].cargo).toMatchObject({ Wood: 1, Sugar: 2, Rum: 3, Spice: 0 });
    expect(after.ships["0"].gold).toBe(goldBefore + 17);
    expect(after.ships["0"].bounties.Spain).toBe(0);
    expect(client.getState()!.ctx.phase).toBe("main");
  });
});

describe("a ship left derelict (#345)", () => {
  it("an NPC whose last crew falls to grape shot is left derelict, and the fight ends", () => {
    const client = startGame(
      { "0": ship(0, 0, { maneuverability: 20, cannons: 20, upgrades: ["grape_shot"] }) },
      { foe: npc("MERCHANT", { crew: 1 }) }
    );
    client.moves.attackNPC("foe");
    client.moves.rollSeamanship();
    client.moves.chooseCombatAction("fire");
    client.moves.rollCannons();
    client.moves.applyResolution();

    const after = G(client);
    expect(after.combat).toBeUndefined();
    expect(after.npcs.foe.isDerelict).toBe(true);
    expect(after.npcs.foe.stats.crew.current).toBe(0);
    expect(after.npcs.foe.stats.hull.current).toBeGreaterThan(0);
  });

  it("an attacker whose last crew falls to the defender's grape shot is left derelict, and the fight ends", () => {
    const client = startGame({
      "0": ship(0, 0, { maneuverability: 20, crew: 1 }),
      "1": ship(1, 0, { cannons: 20, upgrades: ["grape_shot"] }),
    });
    client.moves.attackShip("1");
    client.moves.rollSeamanship();
    client.moves.chooseCombatAction("fire");
    client.moves.rollCannons();
    client.moves.applyResolution();

    const after = G(client);
    expect(after.combat).toBeUndefined();
    expect(after.ships["0"].isDerelict).toBe(true);
    expect(after.ships["1"].isDerelict).toBeUndefined();
  });
});

describe("the missions a fight settles (#345)", () => {
  it("sinking the NPC an assassination names pays its reward and completes it", () => {
    const hunter = ship(0, 0, { maneuverability: 20, cannons: 20 });
    hunter.activeMission = mission("ASSASSINATION", { targetNpcId: "foe" });
    const client = startGame({ "0": hunter }, { foe: npc("FLOTILLA", { hull: 1 }) });
    const before = G(client).ships["0"];
    client.moves.attackNPC("foe");
    client.moves.rollSeamanship();
    client.moves.chooseCombatAction("fire");
    client.moves.rollCannons();
    client.moves.applyResolution();

    const after = G(client);
    expect(after.npcs.foe).toBeUndefined();
    expect(after.ships["0"].activeMission).toBeUndefined();
    expect(after.ships["0"].gold).toBe(before.gold + 50);
    expect(after.floatingLoot).toHaveLength(1);
  });

  it("an attacker on an escort that takes a hit fails the escort's no-damage condition", () => {
    const escort = ship(0, 0, { maneuverability: 20 });
    escort.activeMission = mission("ESCORT", { targetPortName: "Havana", noDamageTaken: true });
    const client = startGame({ "0": escort }, { foe: npc("FLOTILLA", { cannons: 20 }) });
    client.moves.attackNPC("foe");
    client.moves.rollSeamanship();
    client.moves.chooseCombatAction("fire");
    client.moves.rollCannons();
    client.moves.applyResolution();

    expect(G(client).ships["0"].activeMission?.noDamageTaken).toBe(false);
  });
});

describe("each combat step only at its own stage (#345)", () => {
  it("refuses every step but the draw while the fight waits on the draw", () => {
    const client = startGame({ "0": ship(0, 0), "1": ship(1, 0) });
    client.moves.attackShip("1");
    const before = JSON.stringify(G(client));
    client.moves.chooseCombatAction("fire");
    client.moves.rollFleeAttempt();
    client.moves.rollCannons();
    client.moves.applyResolution();
    expect(JSON.stringify(G(client))).toBe(before);
  });
});
