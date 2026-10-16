import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, CombatStage, Mission, NPCRole, NPCShip, ShipState } from "./types";
import type { VolleyAim } from "./types";
import { COMBAT_STAGES, VOLLEY_AIMS } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { MAX_MAST_DAMAGE } from "./combat";
import { isVolleyStage, volleysFired, applyCannons, applyCombatResolution, applyRollDefenderSeamanship, applyRollSeamanship, canChooseCombatAction, openFight } from "./combatMoves";
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

function startGame(ships: Record<string, ShipState>, npcs: Record<string, NPCShip> = {}, seed = "combat-moves-345") {
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
  client.moves.rollCannons("hull");
  client.moves.applyResolution();
  expect(G(client).combat).toMatchObject({ round: 2, stage: "seamanship" });
}

describe("an NPC that wins the draw picks its own action (#345)", () => {
  it("outgunned, it flees: the fight goes to the flight, and the faster NPC gets clean away, never having fired", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 4 }) }, { foe: npc("MERCHANT", { maneuverability: 20 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons("hull");
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

    client.moves.rollCannons("hull");
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
    client.moves.rollCannons("crew");
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
    client.moves.rollCannons("hull");
    client.moves.returnFire("crew");
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
    client.moves.rollCannons("hull");
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
    client.moves.rollCannons("hull");
    expect(G(client).combat!.defenderHits).toBeGreaterThan(0);

    expect(G(client).ships["0"].activeMission?.noDamageTaken).toBe(false);
  });
});

/** Each step's move, by the stage it presses. */
const STEP_MOVES = {
  seamanship: (c: TestClient) => c.moves.rollSeamanship(),
  defenderSeamanship: (c: TestClient) => c.moves.rollDefenderSeamanship(),
  chooseAction: (c: TestClient) => c.moves.chooseCombatAction("fire"),
  fleeAttempt: (c: TestClient) => c.moves.rollFleeAttempt(),
  cannons: (c: TestClient) => c.moves.rollCannons("hull"),
  returnFire: (c: TestClient) => c.moves.returnFire("hull"),
  resolution: (c: TestClient) => c.moves.applyResolution(),
} satisfies Record<CombatStage, (c: TestClient) => void>;

/** A fight between two gunless ships brought to `stage`: the attacker, faster, wins the draw and flees. */
function fightAt(stage: CombatStage): TestClient {
  if (stage === "returnFire") {
    // The answer (#348): the defender has guns to answer the attacker's opening broadside with
    const client = startGame({ "0": ship(0, 0), "1": ship(1, 0, { cannons: 2 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons("hull");
    expect(G(client).combat!.stage).toBe("returnFire");
    return client;
  }
  const client = startGame({ "0": ship(0, 0, { maneuverability: 20 }), "1": ship(1, 0) });
  client.moves.attackShip("1");
  const path: CombatStage[] = ["cannons", "resolution", "seamanship", "defenderSeamanship", "chooseAction", "fleeAttempt"];
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
      "0": ship(0, 0, { cannons: 20 }),
      "1": ship(1, 0, { cannons: 20, crew: 20 }),
    });
    client.moves.attackShip("1");
    client.moves.rollCannons("crew");
    client.moves.returnFire("hull");

    const after = G(client);
    const [first, answer] = after.combat!.volleys!;
    expect(first).toMatchObject({ shooterId: "0", guns: 20 });
    expect(first.hits).toBeGreaterThan(0);
    // The opening broadside, aimed at the crew, took its gunners before the answer was rolled.
    const gunnersLeft = 20 - first.hits;
    expect(after.ships["1"].stats!.crew.current).toBe(gunnersLeft);
    expect(answer).toMatchObject({ shooterId: "1", guns: gunnersLeft });
    expect(after.combat!.volleys).toHaveLength(2);
    // Both volleys' damage has landed already, before the round's end.
    expect(after.combat!.stage).toBe("resolution");
    expect(after.ships["0"].stats!.hull.current).toBe(40 - answer.hits);
  });

  it("a defender sunk by the opening broadside never fires back", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }), "1": ship(1, 0, { cannons: 20, hull: 1 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons("hull");

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
    client.moves.rollCannons("hull");
    expect(G(client).combat!.volleys).toHaveLength(1);
    expect(G(client).ships["0"].stats!.hull.current).toBe(40);
  });

  it("an NPC sunk by the opening broadside never fires back", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }) }, { foe: npc("FLOTILLA", { cannons: 20, hull: 1 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons("hull");
    expect(G(client).combat!.volleys).toEqual([expect.objectContaining({ shooterId: "0" })]);
    expect(G(client).ships["0"].stats!.hull.current).toBe(40);
  });

  it("a defender with no guns stays in the fight: round 2 opens on the draw, and it may flee then", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 0 }), "1": ship(1, 0, { cannons: 0, maneuverability: 20 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons("hull");
    expect(G(client).combat!.volleys).toEqual([{ shooterId: "0", guns: 0, aim: "hull", hits: 0 }]);
    client.moves.applyResolution();
    expect(G(client).combat).toMatchObject({ round: 2, stage: "seamanship", volleys: [] });

    client.moves.rollSeamanship();
    client.moves.rollDefenderSeamanship();
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
      "0": ship(0, 0, { cannons: 20, crew: 20 }),
      "1": ship(1, 0, { cannons: 20, maneuverability: 20 }),
    });
    client.moves.attackShip("1");
    client.moves.rollCannons("hull");
    client.moves.returnFire("hull");
    client.moves.applyResolution();
    expect(G(client).combat).toMatchObject({ round: 2, stage: "seamanship" });

    client.moves.rollSeamanship();
    client.moves.rollDefenderSeamanship();
    expect(G(client).combat!.seamanshipWinner).toBe("1");
    client.moves.chooseCombatAction("fire");
    client.moves.rollCannons("crew");

    const [first] = G(client).combat!.volleys!;
    expect(first).toMatchObject({ shooterId: "1", guns: 20, aim: "crew" });
    expect(first.hits).toBeGreaterThan(0);
    expect(G(client).combat!.stage).toBe("returnFire");
    client.moves.returnFire("hull");
    const [, answer] = G(client).combat!.volleys!;
    // The crew shot away before the attacker's answer was rolled.
    expect(answer).toMatchObject({ shooterId: "0", guns: 20 - first.hits });
    expect(G(client).combat!).toMatchObject({ defenderHits: first.hits, attackerHits: answer.hits });
  });
});

describe("from round 2, both captains roll (#347)", () => {
  it("the attacker rolls first, and the fight waits on the defender's roll before anyone has won", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 2 }), "1": ship(1, 0, { maneuverability: 3 }) });
    client.moves.attackShip("1");
    pastTheAmbush(client);

    client.moves.rollSeamanship();
    const waiting = G(client).combat!;
    expect(waiting).toMatchObject({ round: 2, stage: "defenderSeamanship", seamanshipWinner: null });
    expect(Object.keys(waiting.seamanshipRolls)).toEqual(["0"]);
    expect(waiting.seamanshipRolls["0"]).toBeGreaterThanOrEqual(1);
    expect(waiting.seamanshipRolls["0"]).toBeLessThanOrEqual(6);

    client.moves.rollDefenderSeamanship();
    const drawn = G(client).combat!;
    expect(drawn.stage).toBe("chooseAction");
    expect(drawn.seamanshipRolls["0"]).toBe(waiting.seamanshipRolls["0"]);
    expect(drawn.seamanshipRolls["1"]).toBeGreaterThanOrEqual(1);
    expect(drawn.seamanshipRolls["1"]).toBeLessThanOrEqual(6);
    const attackerAhead = 2 + drawn.seamanshipRolls["0"] > 3 + drawn.seamanshipRolls["1"];
    expect(drawn.seamanshipWinner).toBe(attackerAhead ? "0" : "1");
  });

  it("a tie goes to the defender", () => {
    const G0 = {
      ships: { "0": ship(0, 0, { maneuverability: 2 }), "1": ship(1, 0, { maneuverability: 2 }) },
      npcs: {},
      floatingLoot: [],
      combat: { ...openFight("0", "1", 1, false), round: 2, stage: "seamanship", actionChosen: null },
    } as unknown as CaribbeanState;
    applyRollSeamanship(G0, () => 4);
    expect(G0.combat).toMatchObject({ stage: "defenderSeamanship", seamanshipWinner: null });
    applyRollDefenderSeamanship(G0, () => 4);
    expect(G0.combat).toMatchObject({ stage: "chooseAction", seamanshipWinner: "1", seamanshipRolls: { "0": 4, "1": 4 } });
  });

  it("against an NPC, one press rolls both dice", () => {
    const client = startGame({ "0": ship(0, 0, { maneuverability: 20 }) }, { foe: npc("FLOTILLA") });
    client.moves.attackNPC("foe");
    pastTheAmbush(client);

    client.moves.rollSeamanship();
    const combat = G(client).combat!;
    expect(combat).toMatchObject({ stage: "chooseAction", seamanshipWinner: "0" });
    expect(Object.keys(combat.seamanshipRolls).sort()).toEqual(["0", "foe"]);
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
    applyCannons(G0, "hull", () => 6);
    expect(G0.combat!.volleys).toEqual([{ shooterId: "0", guns: 2, aim: "hull", hits: 2 }]);
    // The answer is the defender's own step, aimed by it (#348)
    expect(G0.combat!.stage).toBe("returnFire");
  });
});

/** The damage a volley of `hits` aimed at `aim` does to a ship with sound masts: past MAX_MAST_DAMAGE, mast hits go to the hull. */
function landed(aim: VolleyAim, hits: number) {
  if (aim !== "masts") return { hull: 0, crew: 0, masts: 0, [aim]: hits };
  const masts = Math.min(hits, MAX_MAST_DAMAGE);
  return { hull: hits - masts, crew: 0, masts };
}

describe("every volley is aimed by the ship firing it (#348)", () => {
  it("the opening broadside takes its firer's aim, and every hit lands there", () => {
    for (const aim of VOLLEY_AIMS) {
      const client = startGame({ "0": ship(0, 0, { cannons: 20 }), "1": ship(1, 0, { crew: 30 }) });
      client.moves.attackShip("1");
      client.moves.rollCannons(aim);

      const [volley] = G(client).combat!.volleys!;
      expect(volley).toMatchObject({ shooterId: "0", guns: 20, aim });
      expect(volley.hits).toBeGreaterThan(0);
      const target = G(client).ships["1"];
      expect(target.damage).toEqual(landed(aim, volley.hits));
      expect(target.stats!.hull.current).toBe(40 - landed(aim, volley.hits).hull);
      expect(target.stats!.crew.current).toBe(aim === "crew" ? 30 - volley.hits : 30);
    }
  });

  it("refuses to fire with no aim, or one it does not know", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 2 }), "1": ship(1, 0) });
    client.moves.attackShip("1");
    const before = JSON.stringify(G(client));
    client.moves.rollCannons();
    client.moves.rollCannons("guns");
    client.moves.rollCannons({ aim: "hull" });
    expect(JSON.stringify(G(client))).toBe(before);
  });

  it("the answer waits on the answering ship's own aim, with the first volley's damage landed", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }), "1": ship(1, 0, { cannons: 20, crew: 30 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons("crew");

    const waiting = G(client).combat!;
    expect(waiting.stage).toBe("returnFire");
    expect(waiting.volleys).toHaveLength(1);
    const lost = waiting.volleys![0].hits;
    expect(G(client).ships["1"].stats!.crew.current).toBe(30 - lost);
    // The first ship cannot fire again, nor end the round, before the answer
    client.moves.rollCannons("hull");
    client.moves.applyResolution();
    expect(G(client).combat!.volleys).toHaveLength(1);

    client.moves.returnFire("masts");
    const [, answer] = G(client).combat!.volleys!;
    expect(answer).toMatchObject({ shooterId: "1", guns: 20, aim: "masts" });
    expect(G(client).combat!.stage).toBe("resolution");
    expect(G(client).ships["0"].damage).toEqual(landed("masts", answer.hits));
    expect(G(client).ships["0"].stats!.hull.current).toBe(40 - landed("masts", answer.hits).hull);
  });

  it("refuses an answer with no aim", () => {
    const client = fightAt("returnFire");
    const before = JSON.stringify(G(client));
    client.moves.returnFire();
    client.moves.returnFire("rigging");
    expect(JSON.stringify(G(client))).toBe(before);
  });

  it("chain shot adds a hit only to a volley aimed at the masts, grape shot only to one aimed at the crew", () => {
    const fired = (upgrades: string[], aim: VolleyAim) => {
      const client = startGame({ "0": ship(0, 0, { cannons: 20, upgrades }), "1": ship(1, 0, { crew: 30 }) });
      client.moves.attackShip("1");
      client.moves.rollCannons(aim);
      return { hits: G(client).combat!.volleys![0].hits, damage: G(client).ships["1"].damage };
    };
    // The same seed rolls the same dice: each loadout's volley hits the same number of times
    const { hits } = fired([], "hull");
    expect(hits).toBeGreaterThan(0);
    expect(fired(["chain_shot"], "masts").damage).toEqual(landed("masts", hits + 1));
    expect(fired(["chain_shot"], "hull").damage).toEqual({ hull: hits, crew: 0, masts: 0 });
    expect(fired(["grape_shot"], "crew").damage).toEqual({ hull: 0, crew: hits + 1, masts: 0 });
    expect(fired(["grape_shot"], "masts").damage).toEqual(landed("masts", hits));
  });

  it("over many seeds, a fight's volleys damage only where each was aimed", () => {
    for (let seed = 0; seed < 40; seed++) {
      const first = VOLLEY_AIMS[seed % 3];
      const second = VOLLEY_AIMS[Math.floor(seed / 3) % 3];
      const client = startGame({ "0": ship(0, 0, { cannons: 4 }), "1": ship(1, 0, { cannons: 4 }) }, {}, `aim-${seed}`);
      client.moves.attackShip("1");
      client.moves.rollCannons(first);
      client.moves.returnFire(second);
      const [volley, answer] = G(client).combat!.volleys!;
      expect(volley.aim).toBe(first);
      expect(answer.aim).toBe(second);
      expect(G(client).ships["1"].damage).toEqual(landed(first, volley.hits));
      expect(G(client).ships["0"].damage).toEqual(landed(second, answer.hits));
    }
  });

  it("an NPC answers on its own, aimed at the hull", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }) }, { foe: npc("FLOTILLA", { cannons: 20 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons("masts");

    const combat = G(client).combat!;
    expect(combat.stage).toBe("resolution");
    expect(combat.volleys!.map((v) => [v.shooterId, v.aim])).toEqual([["0", "masts"], ["foe", "hull"]]);
    expect(G(client).ships["0"].damage).toEqual({ hull: combat.volleys![1].hits, crew: 0, masts: 0 });
  });

  it("an NPC's volley takes the engine's aim, whatever aim is sent, and refuses an aim the game does not know", () => {
    const fired = (aim?: unknown) => {
      const client = startGame({ "0": ship(0, 0, { cannons: 20 }) }, { foe: npc("FLOTILLA", { cannons: 20, maneuverability: 20 }) });
      client.moves.attackNPC("foe");
      client.moves.rollCannons("hull");
      client.moves.applyResolution();
      client.moves.rollSeamanship();
      expect(G(client).combat).toMatchObject({ seamanshipWinner: "foe", stage: "cannons" });
      const before = JSON.stringify(G(client));
      client.moves.rollCannons(aim);
      return { client, unchanged: JSON.stringify(G(client)) === before };
    };
    expect(fired("guns").unchanged).toBe(true);
    expect(fired({ aim: "hull" }).unchanged).toBe(true);
    for (const aim of [undefined, null, "masts"]) {
      const { client, unchanged } = fired(aim);
      expect(unchanged).toBe(false);
      expect(G(client).combat!.volleys!.map((v) => [v.shooterId, v.aim])).toEqual([["foe", "hull"]]);
    }
  });

  it("an NPC that catches a fleeing player fires the parting shot, aimed by the engine, and the fight ends", () => {
    /** The player (manoeuvrability 6, masts shot away) wins every draw against the NPC of 0 and flees. */
    const chase = (seed: number) => {
      const fleeing = ship(0, 0, { maneuverability: 6 });
      fleeing.damage.masts = MAX_MAST_DAMAGE;
      const client = startGame({ "0": fleeing }, { foe: npc("FLOTILLA", { cannons: 4 }) }, `npc-chase-${seed}`);
      client.moves.attackNPC("foe");
      client.moves.rollCannons("hull");
      client.moves.applyResolution();
      client.moves.rollSeamanship();
      client.moves.chooseCombatAction("flee");
      client.moves.rollFleeAttempt();
      return client;
    };
    const seed = Array.from({ length: 60 }, (_, i) => i).find((i) => G(chase(i)).combat?.fleeOutcome === "caught");
    expect(seed).toBeDefined();
    const client = chase(seed!);
    expect(G(client).combat).toMatchObject({ stage: "cannons", fleeOutcome: "caught", seamanshipWinner: "0" });

    // The player presses the NPC's parting shot; the engine aims it
    client.moves.rollCannons();
    expect(G(client).combat!.volleys).toEqual([expect.objectContaining({ shooterId: "foe", aim: "hull" })]);
    expect(G(client).combat!.stage).toBe("resolution");
    client.moves.applyResolution();
    expect(G(client).combat).toBeUndefined();
    expect(client.getState()!.ctx.phase).toBe("main");
  });

  it("an NPC that fires first aims at the hull, and the player then aims its own answer", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }) }, { foe: npc("FLOTILLA", { cannons: 20, maneuverability: 20 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons("hull");
    client.moves.applyResolution();
    client.moves.rollSeamanship();
    expect(G(client).combat).toMatchObject({ seamanshipWinner: "foe", actionChosen: "fire", stage: "cannons" });

    // The player presses the NPC's volley; the NPC's own aim is used
    client.moves.rollCannons("hull");
    expect(G(client).combat!.volleys!.map((v) => [v.shooterId, v.aim])).toEqual([["foe", "hull"]]);
    expect(G(client).combat!.stage).toBe("returnFire");

    client.moves.returnFire("crew");
    expect(G(client).combat!.volleys!.map((v) => [v.shooterId, v.aim])).toEqual([["foe", "hull"], ["0", "crew"]]);
    expect(G(client).npcs.foe.stats.crew.current).toBe(20 - G(client).combat!.volleys![1].hits);
  });

  /**
   * A flight over many seeds: the defender (manoeuvrability 5, carrying
   * `masts` mast damage) wins every draw against a gunless attacker of 0 and
   * flees. Neither ship has a gun, so each seed rolls the same dice whatever
   * the masts: the draw, then the pursuit.
   */
  function flight(seed: number, masts: number) {
    const fleeing = ship(1, 0, { maneuverability: 5 });
    fleeing.damage.masts = masts;
    const client = startGame({ "0": ship(0, 0), "1": fleeing }, {}, `flee-${seed}`);
    client.moves.attackShip("1");
    pastTheAmbush(client);
    client.moves.rollSeamanship();
    client.moves.rollDefenderSeamanship();
    expect(G(client).combat!.seamanshipWinner).toBe("1");
    client.moves.chooseCombatAction("flee");
    client.moves.rollFleeAttempt();
    return client;
  }
  const caught = (client: TestClient) => G(client).combat?.fleeOutcome === "caught";

  it("mast damage counts against a flight, up to MAX_MAST_DAMAGE: over many seeds, damaged masts are caught more often, never less", () => {
    let caughtOnlyByMasts = 0;
    for (let seed = 0; seed < 60; seed++) {
      const sound = caught(flight(seed, 0));
      const shotAway = caught(flight(seed, MAX_MAST_DAMAGE));
      if (sound) expect(shotAway).toBe(true);
      if (shotAway && !sound) caughtOnlyByMasts++;
      // Mast damage past the cap (from before it) counts as the cap
      expect(caught(flight(seed, 30))).toBe(shotAway);
    }
    expect(caughtOnlyByMasts).toBeGreaterThan(0);
  });

  it("the pursuer aims the parting shot at the ship it caught, and nobody answers it", () => {
    const seed = Array.from({ length: 60 }, (_, i) => i).find((i) => caught(flight(i, MAX_MAST_DAMAGE)));
    expect(seed).toBeDefined();
    const client = flight(seed!, MAX_MAST_DAMAGE);
    expect(G(client).combat).toMatchObject({ fleeOutcome: "caught", stage: "cannons" });

    client.moves.rollCannons("crew");
    expect(G(client).combat!.volleys).toEqual([expect.objectContaining({ shooterId: "0", aim: "crew" })]);
    expect(G(client).combat!.stage).toBe("resolution");
  });
});

describe("the volleys fired by a step (#348)", () => {
  const volley = (shooterId: string, hits: number) => ({ shooterId, guns: 4, aim: "hull" as const, hits });
  const at = (stage: CombatStage, volleys = [] as ReturnType<typeof volley>[]) => ({ stage, volleys });

  it("isVolleyStage: the cannons and the answer, no other step", () => {
    expect(COMBAT_STAGES.filter(isVolleyStage)).toEqual(["cannons", "returnFire"]);
  });

  it("the first volley as the answer waits, then only the answer, and the parting shot alone", () => {
    expect(volleysFired(at("cannons"), at("returnFire", [volley("0", 2)]))).toEqual([volley("0", 2)]);
    expect(volleysFired(at("returnFire", [volley("0", 2)]), at("resolution", [volley("0", 2), volley("1", 1)]))).toEqual([volley("1", 1)]);
    expect(volleysFired(at("cannons"), at("resolution", [volley("0", 2), volley("1", 1)]))).toEqual([volley("0", 2), volley("1", 1)]);
  });

  it("none at any other step, nor when the fight ended, nor from a fight stored with no volleys", () => {
    expect(volleysFired(at("resolution", [volley("0", 2)]), at("seamanship"))).toEqual([]);
    expect(volleysFired(at("cannons"), undefined)).toEqual([]);
    expect(volleysFired(at("cannons"), { stage: "resolution" })).toEqual([]);
  });
});
