import { afterEach, describe, it, expect, vi } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexEquals, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, NPCShip, ShipState } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { createShipState } from "./economy";

/**
 * Mission and loot ids come from the game, not the clock or the process
 * (#320): the same moves from the same seed make the same G, ids and all, on
 * any machine at any time, so a match replays and the server's reducer agrees
 * with itself across cold starts.
 */

const PORT = hex(-4, 0);
const DOCK = hex(-3, 0);

/** Open water with two English ports, so the tavern always has somewhere to send a mission. */
const cells: MapCell[] = hexGrid(5).map((h) =>
  hexEquals(h, PORT)
    ? { hex: h, terrain: "island", hasPort: true, nation: "England", portName: "Port Royal", dockingHex: DOCK, elevation: 1 }
    : hexEquals(h, hex(4, 0))
      ? { hex: h, terrain: "island", hasPort: true, nation: "England", portName: "Kingston", dockingHex: hex(3, 0), elevation: 1 }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0 }
);

const captain = (id: string): Captain => ({ id, name: id, nation: "England", ability: "" });

/** A player ship. With guns it wins every roll and fires twenty; without, one hit sinks it. */
function ship(at: ReturnType<typeof hex>, id: string, guns: boolean): ShipState {
  const s = createShipState(at, "Galleon");
  s.stats!.maneuverability = guns ? 20 : 0;
  s.stats!.cannons = guns ? 20 : 0;
  s.stats!.crew = { current: 20, max: 20 };
  s.stats!.hull = guns ? { current: 40, max: 40 } : { current: 1, max: 1 };
  s.captain = captain(id);
  s.gold = 100;
  return s;
}

/** A merchant that cannot fight back: one hit sinks it. */
function merchant(at: ReturnType<typeof hex>): NPCShip {
  return {
    id: "npc-1",
    position: at,
    cargo: { Wood: 1, Sugar: 0, Rum: 0, Spice: 0 },
    gold: 10,
    shipClass: "Flute",
    stats: {
      maneuverability: 0,
      scouting: 1,
      cannons: 0,
      crew: { current: 5, max: 5 },
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

function startGame(extra: Partial<CaribbeanState> = {}) {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed: "deterministic-ids-320",
    phases: {
      main: { ...(Caribbean.phases?.main ?? {}), start: true },
      combat: Caribbean.phases!.combat!,
    },
    setup: () => ({
      cells,
      ships: { "0": ship(DOCK, "blackbeard", true), "1": ship(hex(-2, 0), "surcouf", false) },
      mapSize: "small",
      captainDeck: [captain("drake"), captain("morgan")],
      draftHands: {},
      floatingLoot: [],
      npcs: { "npc-1": merchant(hex(-3, 1)) },
      npcIdCounter: 1,
      missionIdCounters: {},
      lootIdCounter: 0,
      wrap: null,
      pirates: {},
      bountyClaims: [],
      movesUsed: 0,
      ...extra,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: 2 });
  client.start();
  return client;
}

type TestClient = ReturnType<typeof startGame>;

/** Play one exchange of cannon fire through to the end of the combat. */
function fireOnce(client: TestClient): void {
  client.moves.rollSeamanship();
  client.moves.chooseCombatAction("fire");
  client.moves.rollCannons();
  client.moves.applyResolution();
}

/**
 * Seat 0, docked at Port Royal, sinks the merchant alongside; seat 1 passes;
 * seat 0 then takes a mission at the tavern and sinks seat 1's ship. A
 * mission and two floating loots, all made by moves.
 */
function play(client: TestClient): CaribbeanState {
  client.moves.attackNPC("npc-1");
  fireOnce(client);
  client.events.endTurn!();
  client.moves.listenForRumors();
  client.moves.attackShip("1");
  fireOnce(client);
  return client.getState()!.G;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("mission and loot ids (#320)", () => {
  it("are the same when the same moves are played twice from the same seed, at different times", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const first = play(startGame());
    vi.setSystemTime(new Date("2027-06-15T12:34:56Z"));
    const second = play(startGame());

    // The moves did make a mission and loot, so the ids are in G to compare
    expect(first.floatingLoot).toHaveLength(2);
    expect(Object.values(first.ships).some((s) => s.activeMission)).toBe(true);
    const ids = (G: CaribbeanState) => [G.floatingLoot.map((loot) => loot.id), G.ships["0"].activeMission?.id];
    expect(ids(second)).toEqual(ids(first));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("count missions and loot apart, so a public loot id says nothing of who visited a tavern", () => {
    const G = play(startGame());
    expect(G.floatingLoot.map((loot) => loot.id)).toEqual(["loot-1", "loot-2"]);
    expect(G.ships["0"].activeMission?.id).toBe("mission-0-1");
  });

  it("number each seat's missions apart, so a seat's own id says nothing of the other seats' draws", () => {
    // Both captains docked, at Port Royal and at Kingston
    const client = startGame({ ships: { "0": ship(DOCK, "blackbeard", true), "1": ship(hex(3, 0), "surcouf", true) } });
    for (let i = 0; i < 3; i++) {
      client.moves.listenForRumors();
      client.moves.abandonMission();
    }
    client.moves.listenForRumors();
    expect(client.getState()!.G.ships["0"].activeMission?.id).toBe("mission-0-4");
    client.events.endTurn!();
    client.moves.listenForRumors();
    expect(client.getState()!.G.ships["1"].activeMission?.id).toBe("mission-1-1");
  });

  it("never repeat within a match", () => {
    const G = play(startGame());
    const ids = [...G.floatingLoot.map((loot) => loot.id), ...Object.values(G.ships).flatMap((s) => (s.activeMission ? [s.activeMission.id] : []))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("start after a match stored before the counter existed, and cannot clash with its clock-made ids", () => {
    const client = startGame({
      missionIdCounters: undefined,
      lootIdCounter: undefined,
      floatingLoot: [{ id: "loot-1-1712345678901", hex: hex(2, 2), cargo: { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 }, gold: 0 }],
    });
    const G = play(client);
    const ids = G.floatingLoot.map((loot) => loot.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
  });
});
