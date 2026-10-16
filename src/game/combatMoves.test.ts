import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, CombatStage, Mission, NPCRole, NPCShip, ShipState } from "./types";
import { COMBAT_STAGES } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { applyCannons, applyCombatResolution, canChooseCombatAction, openFight } from "./combatMoves";
import { createShipState } from "./economy";
import { silenceInvalidMoveLogs } from "../testSupport/silenceInvalidMoveLogs";

// The stage test sends refused moves on purpose; boardgame.io logs each one.
silenceInvalidMoveLogs();

/**
 * The combat phase's paths no other suite plays through a client (#345):
 * the NPC's own choice when it wins the draw, boarding a flotilla, a ship
 * left derelict, and the missions a fight settles; and the ambush that opens
 * every fight, volley by volley (#346). Each fight is made
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

/**
 * Round 1, the ambush, played out with no damage either way (neither side
 * has a gun), so the fight is in round 2, at the draw.
 */
function pastTheAmbush(client: TestClient) {
  client.moves.rollCannons();
  client.moves.applyResolution();
  expect(G(client).combat).toMatchObject({ round: 2, stage: "seamanship" });
}

describe("an NPC that wins the draw picks its own action (#345)", () => {
  it("outgunned, it flees: the fight goes to the flight, and the faster NPC gets clean away, never having fired", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 4 }) }, { foe: npc("MERCHANT", { maneuverability: 20 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons();
    client.moves.applyResolution();
    client.moves.rollSeamanship();
    expect(G(client).combat).toMatchObject({ seamanshipWinner: "foe", actionChosen: "flee", stage: "fleeAttempt" });

    client.moves.rollFleeAttempt();
    expect(G(client).combat).toBeUndefined();
    expect(client.getState()!.ctx.phase).toBe("main");
    expect(G(client).ships["0"].stats!.hull.current).toBe(40);
    expect(G(client).floatingLoot).toEqual([]);
  });

  it("not outgunned, it fires: the fight goes straight to the cannons, and the NPC fires first", () => {
    const client = startGame({ "0": ship(0, 0) }, { foe: npc("FLOTILLA", { maneuverability: 20 }) });
    client.moves.attackNPC("foe");
    pastTheAmbush(client);
    client.moves.rollSeamanship();
    expect(G(client).combat).toMatchObject({ seamanshipWinner: "foe", actionChosen: "fire", stage: "cannons" });

    client.moves.rollCannons();
    expect(G(client).combat!.volleys!.map((v) => v.shooterId)).toEqual(["foe"]);
  });
});

describe("boarding an NPC (#345)", () => {
  it("a flotilla: its cargo and gold come aboard, no bounty is added, and it is gone", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 20 }) }, { foe: npc("FLOTILLA") });
    client.moves.attackNPC("foe");
    pastTheAmbush(client);
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
      { "0": ship(0, 0, { cannons: 20, upgrades: ["grape_shot"] }) },
      { foe: npc("MERCHANT", { crew: 1 }) }
    );
    client.moves.attackNPC("foe");
    client.moves.rollCannons();
    expect(G(client).combat!.attackerHits).toBeGreaterThan(0);
    client.moves.applyResolution();

    const after = G(client);
    expect(after.combat).toBeUndefined();
    expect(after.npcs.foe.isDerelict).toBe(true);
    expect(after.npcs.foe.stats.crew.current).toBe(0);
    expect(after.npcs.foe.stats.hull.current).toBeGreaterThan(0);
  });

  it("an attacker whose last crew falls to the defender's grape shot is left derelict, and the fight ends", () => {
    const client = startGame({
      "0": ship(0, 0, { crew: 1 }),
      "1": ship(1, 0, { cannons: 20, upgrades: ["grape_shot"] }),
    });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    expect(G(client).combat!.defenderHits).toBeGreaterThan(0);
    client.moves.applyResolution();

    const after = G(client);
    expect(after.combat).toBeUndefined();
    expect(after.ships["0"].isDerelict).toBe(true);
    expect(after.ships["1"].isDerelict).toBeUndefined();
  });
});

describe("the missions a fight settles (#345)", () => {
  it("sinking the NPC an assassination names pays its reward and completes it", () => {
    const hunter = ship(0, 0, { cannons: 20 });
    hunter.activeMission = mission("ASSASSINATION", { targetNpcId: "foe" });
    const client = startGame({ "0": hunter }, { foe: npc("FLOTILLA", { hull: 1 }) });
    const before = G(client).ships["0"];
    client.moves.attackNPC("foe");
    client.moves.rollCannons();
    expect(G(client).combat!.attackerHits).toBeGreaterThan(0);
    client.moves.applyResolution();

    const after = G(client);
    expect(after.npcs.foe).toBeUndefined();
    expect(after.ships["0"].activeMission).toBeUndefined();
    expect(after.ships["0"].gold).toBe(before.gold + 50);
    expect(after.floatingLoot).toHaveLength(1);
  });

  it("an attacker on an escort that takes a hit fails the escort's no-damage condition", () => {
    const escort = ship(0, 0);
    escort.activeMission = mission("ESCORT", { targetPortName: "Havana", noDamageTaken: true });
    const client = startGame({ "0": escort }, { foe: npc("FLOTILLA", { cannons: 20 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons();
    expect(G(client).combat!.defenderHits).toBeGreaterThan(0);

    expect(G(client).ships["0"].activeMission?.noDamageTaken).toBe(false);
  });
});

/** Each step's move, by the stage it presses. */
const STEP_MOVES = {
  seamanship: (c: TestClient) => c.moves.rollSeamanship(),
  chooseAction: (c: TestClient) => c.moves.chooseCombatAction("fire"),
  fleeAttempt: (c: TestClient) => c.moves.rollFleeAttempt(),
  cannons: (c: TestClient) => c.moves.rollCannons(),
  resolution: (c: TestClient) => c.moves.applyResolution(),
} satisfies Record<CombatStage, (c: TestClient) => void>;

/** A fight between two gunless ships brought to `stage`: the attacker, faster, wins the draw and flees. */
function fightAt(stage: CombatStage): TestClient {
  const client = startGame({ "0": ship(0, 0, { maneuverability: 20 }), "1": ship(1, 0) });
  client.moves.attackShip("1");
  const path: CombatStage[] = ["cannons", "resolution", "seamanship", "chooseAction", "fleeAttempt"];
  for (const step of path) {
    if (step === stage) break;
    if (step === "chooseAction") client.moves.chooseCombatAction("flee");
    else STEP_MOVES[step](client);
  }
  expect(G(client).combat!.stage).toBe(stage);
  return client;
}

describe("each combat step only at its own stage (#345)", () => {
  it.each(COMBAT_STAGES)("refuses every other step while the fight waits on %s", (stage) => {
    const client = fightAt(stage);
    const before = JSON.stringify(G(client));
    for (const [step, press] of Object.entries(STEP_MOVES)) {
      if (step !== stage) press(client);
    }
    expect(JSON.stringify(G(client))).toBe(before);
  });
});

describe("round 1 is the ambush (#346)", () => {
  it("a fight opens on the attacker's broadside: no seamanship roll is offered or taken", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 2 }), "1": ship(1, 0, { cannons: 2 }) });
    client.moves.attackShip("1");
    expect(G(client).combat).toMatchObject({ round: 1, stage: "cannons", seamanshipWinner: null });

    client.moves.rollSeamanship();
    expect(G(client).combat).toMatchObject({ round: 1, stage: "cannons", seamanshipRolls: {} });
  });

  it("the attacker's damage lands before the defender answers, and the answer fires with the ship that is left", () => {
    const client = startGame({
      "0": ship(0, 0, { cannons: 20, upgrades: ["grape_shot"] }),
      "1": ship(1, 0, { cannons: 20, crew: 3 }),
    });
    client.moves.attackShip("1");
    client.moves.rollCannons();

    const after = G(client);
    const [first, answer] = after.combat!.volleys!;
    expect(first).toMatchObject({ shooterId: "0", guns: 20 });
    expect(first.hits).toBeGreaterThan(0);
    // Grape shot took one of the three gunners before the answer was rolled.
    expect(after.ships["1"].stats!.crew.current).toBe(2);
    expect(answer).toMatchObject({ shooterId: "1", guns: 2 });
    expect(after.combat!.volleys).toHaveLength(2);
    // Both volleys' damage has landed already, before the round's end.
    expect(after.combat!.stage).toBe("resolution");
    expect(after.ships["1"].stats!.hull.current).toBe(40 - first.hits);
    expect(after.ships["0"].stats!.hull.current).toBe(40 - answer.hits);
  });

  it("a defender sunk by the opening broadside never fires back", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }), "1": ship(1, 0, { cannons: 20, hull: 1 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons();

    expect(G(client).combat!.volleys).toEqual([expect.objectContaining({ shooterId: "0" })]);
    expect(G(client).combat!.defenderHits).toBe(0);
    expect(G(client).ships["0"].stats!.hull.current).toBe(40);

    client.moves.applyResolution();
    expect(G(client).combat).toBeUndefined();
    expect(G(client).ships["1"]).toBeUndefined();
    expect(client.getState()!.ctx.phase).toBe("main");
  });

  it("a defender whose last gunner falls to the opening broadside does not answer", () => {
    const client = startGame({
      "0": ship(0, 0, { cannons: 20, upgrades: ["grape_shot"] }),
      "1": ship(1, 0, { cannons: 20, crew: 1 }),
    });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    expect(G(client).combat!.volleys).toHaveLength(1);
    expect(G(client).ships["0"].stats!.hull.current).toBe(40);
  });

  it("an NPC sunk by the opening broadside never fires back", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }) }, { foe: npc("FLOTILLA", { cannons: 20, hull: 1 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons();
    expect(G(client).combat!.volleys).toEqual([expect.objectContaining({ shooterId: "0" })]);
    expect(G(client).ships["0"].stats!.hull.current).toBe(40);
  });

  it("a defender with no guns stays in the fight: round 2 opens on the draw, and it may flee then", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 0 }), "1": ship(1, 0, { cannons: 0, maneuverability: 20 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    expect(G(client).combat!.volleys).toEqual([{ shooterId: "0", guns: 0, hits: 0 }]);
    client.moves.applyResolution();
    expect(G(client).combat).toMatchObject({ round: 2, stage: "seamanship", volleys: [] });

    client.moves.rollSeamanship();
    client.moves.chooseCombatAction("flee");
    expect(G(client).combat).toMatchObject({ stage: "fleeAttempt" });
  });

  it("refuses board and flee in round 1", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 2 }), "1": ship(1, 0) });
    client.moves.attackShip("1");
    const before = JSON.stringify(G(client));
    client.moves.chooseCombatAction("board");
    client.moves.chooseCombatAction("flee");
    client.moves.rollFleeAttempt();
    expect(JSON.stringify(G(client))).toBe(before);
  });

  it("refuses board and flee in round 1 even at the choice (a fight from before #346)", () => {
    const G0 = { combat: { round: 1, stage: "chooseAction", distance: 1 } } as unknown as CaribbeanState;
    expect(canChooseCombatAction(G0, "board")).toBe(false);
    expect(canChooseCombatAction(G0, "flee")).toBe(false);
    expect(canChooseCombatAction(G0, "fire")).toBe(true);
  });
});

describe("from round 2, damage lands per volley (#346)", () => {
  it("the draw's winner fires first, its damage lands, and the loser answers with the ship that is left", () => {
    const client = startGame({
      "0": ship(0, 0, { cannons: 20, crew: 3 }),
      "1": ship(1, 0, { cannons: 20, maneuverability: 20, upgrades: ["grape_shot"] }),
    });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    client.moves.applyResolution();
    const crew = G(client).ships["0"].stats!.crew.current;
    expect(G(client).combat).toMatchObject({ round: 2, stage: "seamanship" });

    client.moves.rollSeamanship();
    expect(G(client).combat!.seamanshipWinner).toBe("1");
    client.moves.chooseCombatAction("fire");
    client.moves.rollCannons();

    const [first, answer] = G(client).combat!.volleys!;
    expect(first).toMatchObject({ shooterId: "1", guns: 20 });
    expect(first.hits).toBeGreaterThan(0);
    // Grape shot took a gunner before the attacker's answer was rolled.
    expect(answer).toMatchObject({ shooterId: "0", guns: crew - 1 });
    expect(G(client).combat!).toMatchObject({ defenderHits: first.hits, attackerHits: answer.hits });
  });

});

describe("a fight from before #346, mid-round when the change deploys", () => {
  /** A fight stored by the old rules: no volleys recorded, its hits rolled but not yet landed. */
  function legacyFight(stage: CombatStage): CaribbeanState {
    const { volleys: _volleys, ...combat } = openFight("0", "1", 1, false);
    void _volleys;
    return {
      ships: { "0": ship(0, 0, { cannons: 2 }), "1": ship(1, 0, { cannons: 2 }) },
      npcs: {},
      floatingLoot: [],
      combat: { ...combat, round: 2, stage, seamanshipWinner: "0", attackerHits: 3, defenderHits: 2 },
    } as unknown as CaribbeanState;
  }

  it("at the resolution: the round ends without the old hits, and the fight goes on to the draw", () => {
    const G0 = legacyFight("resolution");
    expect(applyCombatResolution(G0, 1)).toBe("continues");
    expect(G0.combat).toMatchObject({ round: 3, stage: "seamanship", volleys: [] });
    expect(G0.ships["0"].stats!.hull.current).toBe(40);
    expect(G0.ships["1"].stats!.hull.current).toBe(40);
  });

  it("at the cannons: the volleys are fired by the new rules", () => {
    const G0 = legacyFight("cannons");
    applyCannons(G0, () => 6);
    expect(G0.combat!.volleys).toEqual([
      { shooterId: "0", guns: 2, hits: 2 },
      { shooterId: "1", guns: 2, hits: 2 },
    ]);
  });
});
