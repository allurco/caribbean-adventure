import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, CombatStage, CombatState, Mission, NPCRole, NPCShip, ShipState } from "./types";
import { COMBAT_STAGES } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { MAX_MAST_DAMAGE } from "./combat";
import { firstToFireReaches, isVolleyStage, volleysFired, volleyShooter, applyCannons, applyCombatResolution, applyRollDefenderSeamanship, applyRollSeamanship, canChooseCombatAction, openFight } from "./combatMoves";
import { createShipState } from "./economy";
import { silenceInvalidMoveLogs } from "../testSupport/silenceInvalidMoveLogs";
import { fireTheAmbush } from "../testSupport/combatSteps";

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
  client.moves.rollCannons();
  expect(G(client).combat).toMatchObject({ round: 2, stage: "seamanship" });
}

describe("an NPC that wins the draw picks its own action (#345)", () => {
  it("outgunned, it flees: the fight goes to the flight, and the faster NPC gets clean away, never having fired", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 4 }) }, { foe: npc("MERCHANT", { maneuverability: 20 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons();
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
    // The player has no gun to answer with: the round settles at once
    expect(G(client).lastRound!.volleys.map((v) => v.shooterId)).toEqual(["foe"]);
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
  it("an NPC whose last crew falls is left derelict, and the fight ends with the volley that did it", () => {
    const client = startGame(
      { "0": ship(0, 0, { cannons: 20 }) },
      { foe: npc("MERCHANT", { crew: 1 }) }
    );
    client.moves.attackNPC("foe");
    client.moves.rollCannons();

    const after = G(client);
    expect(after.lastRound!.volleys[0].locations!.crew).toBeGreaterThan(0);
    expect(after.combat).toBeUndefined();
    expect(client.getState()!.ctx.phase).toBe("main");
    expect(after.npcs.foe.isDerelict).toBe(true);
    expect(after.npcs.foe.stats.crew.current).toBe(0);
    expect(after.npcs.foe.stats.hull.current).toBeGreaterThan(0);
  });

  it("an attacker whose last crew falls to the defender's answer is left derelict, and the fight ends", () => {
    const client = startGame({
      "0": ship(0, 0, { crew: 1 }),
      "1": ship(1, 0, { cannons: 20 }),
    });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    client.moves.returnFire();

    const after = G(client);
    expect(after.lastRound!.volleys[1].locations!.crew).toBeGreaterThan(0);
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

    const after = G(client);
    expect(after.lastRound!.volleys[0].hits).toBeGreaterThan(0);
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
    expect(G(client).lastRound!.volleys[1].hits).toBeGreaterThan(0);

    expect(G(client).ships["0"].activeMission?.noDamageTaken).toBe(false);
  });
});

/** Each step's move, by the stage it presses. */
const STEP_MOVES = {
  seamanship: (c: TestClient) => c.moves.rollSeamanship(),
  defenderSeamanship: (c: TestClient) => c.moves.rollDefenderSeamanship(),
  chooseAction: (c: TestClient) => c.moves.chooseCombatAction("fire"),
  fleeAttempt: (c: TestClient) => c.moves.rollFleeAttempt(),
  cannons: (c: TestClient) => c.moves.rollCannons(),
  returnFire: (c: TestClient) => c.moves.returnFire(),
  resolution: (c: TestClient) => c.moves.applyResolution(),
} satisfies Record<CombatStage, (c: TestClient) => void>;

/**
 * A client whose game starts mid-fight, at `combat` (a fight stored before
 * #380 at the resolution, which play no longer reaches).
 */
function startMidFight(ships: Record<string, ShipState>, combat: CaribbeanState["combat"], npcs: Record<string, NPCShip> = {}) {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed: "mid-fight-380",
    phases: {
      main: Caribbean.phases!.main!,
      combat: { ...Caribbean.phases!.combat!, start: true },
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
      combat,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: Object.keys(ships).length });
  client.start();
  return client;
}

/** A fight between two gunless ships brought to `stage`: the attacker, faster, wins the draw and flees. */
function fightAt(stage: CombatStage): TestClient {
  if (stage === "returnFire") {
    // The answer (#348): the defender has guns to answer the attacker's opening broadside with
    const client = startGame({ "0": ship(0, 0), "1": ship(1, 0, { cannons: 2 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    expect(G(client).combat!.stage).toBe("returnFire");
    return client;
  }
  if (stage === "resolution") {
    // Only a fight stored before #380 waits on the resolution
    return startMidFight({ "0": ship(0, 0), "1": ship(1, 0) }, { ...openFight("0", "1", 1, false), round: 2, stage: "resolution" });
  }
  const client = startGame({ "0": ship(0, 0, { maneuverability: 20 }), "1": ship(1, 0) });
  client.moves.attackShip("1");
  const path: CombatStage[] = ["cannons", "seamanship", "defenderSeamanship", "chooseAction", "fleeAttempt"];
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
    client.moves.rollCannons();
    const first = G(client).combat!.volleys![0];
    expect(first).toMatchObject({ shooterId: "0", guns: 20 });
    expect(first.locations!.crew).toBeGreaterThan(0);
    // The opening broadside's hits on the crew took its gunners before the answer was rolled.
    const gunnersLeft = 20 - first.locations!.crew;
    expect(G(client).ships["1"].stats!.crew.current).toBe(gunnersLeft);

    client.moves.returnFire();
    const after = G(client);
    const [, answer] = after.lastRound!.volleys;
    expect(answer).toMatchObject({ shooterId: "1", guns: gunnersLeft });
    expect(after.lastRound!.volleys).toHaveLength(2);
    // The round settled itself as the answer landed: round 2's draw is next.
    expect(after.combat).toMatchObject({ round: 2, stage: "seamanship" });
    expect(after.ships["0"].stats!.hull.current).toBe(40 - answer.locations!.hull - Math.max(0, answer.locations!.masts - MAX_MAST_DAMAGE));
  });

  it("a defender sunk by the opening broadside never fires back", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }), "1": ship(1, 0, { cannons: 20, hull: 1 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons();

    expect(G(client).lastRound!.volleys).toEqual([expect.objectContaining({ shooterId: "0" })]);
    expect(G(client).lastRound!.ended).toBe(true);
    expect(G(client).ships["0"].stats!.hull.current).toBe(40);
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
    expect(G(client).lastRound!.volleys).toHaveLength(1);
    expect(G(client).ships["0"].stats!.hull.current).toBe(40);
  });

  it("an NPC sunk by the opening broadside never fires back", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }) }, { foe: npc("FLOTILLA", { cannons: 20, hull: 1 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons();
    expect(G(client).lastRound!.volleys).toEqual([expect.objectContaining({ shooterId: "0" })]);
    expect(G(client).ships["0"].stats!.hull.current).toBe(40);
  });

  it("a defender with no guns stays in the fight: round 2 opens on the draw, and it may flee then", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 0 }), "1": ship(1, 0, { cannons: 0, maneuverability: 20 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    expect(G(client).lastRound!.volleys).toEqual([{ shooterId: "0", guns: 0, hits: 0, locations: { hull: 0, masts: 0, crew: 0 }, shots: [], dealt: { hull: 0, masts: 0, crew: 0 } }]);
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

  /** A round-1 fight at the choice (from before #346), the draw won by the defender, `distance` hexes off. */
  const legacyChoice = (distance: number) =>
    ({
      ships: { "0": ship(0, 0, { upgrades: ["long_guns"] }), "1": ship(distance, 0) },
      npcs: {},
      combat: { attackerId: "0", defenderId: "1", seamanshipWinner: "1", isNPCCombat: false, round: 1, stage: "chooseAction", distance },
    }) as unknown as CaribbeanState;

  it("refuses board and flee in round 1 even at the choice (a fight from before #346)", () => {
    const G0 = legacyChoice(1);
    expect(canChooseCombatAction(G0, "board")).toBe(false);
    expect(canChooseCombatAction(G0, "flee")).toBe(false);
    expect(canChooseCombatAction(G0, "fire")).toBe(true);
  });

  it("at a round-1 choice from before #346 won by a ship out of range, fire is still the one action: the attacker fires first, and it reaches (#356)", () => {
    const G0 = legacyChoice(2);
    expect(canChooseCombatAction(G0, "fire")).toBe(true);
    expect(canChooseCombatAction(G0, "board")).toBe(false);
    expect(canChooseCombatAction(G0, "flee")).toBe(false);
  });
});

describe("from round 2, damage lands per volley (#346)", () => {
  it("the draw's winner fires first, its damage lands, and the loser answers with the ship that is left", () => {
    const client = startGame({
      "0": ship(0, 0, { cannons: 20, crew: 20 }),
      "1": ship(1, 0, { cannons: 20, maneuverability: 20 }),
    });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    client.moves.returnFire();
    expect(G(client).combat).toMatchObject({ round: 2, stage: "seamanship" });

    client.moves.rollSeamanship();
    client.moves.rollDefenderSeamanship();
    expect(G(client).combat!.seamanshipWinner).toBe("1");
    client.moves.chooseCombatAction("fire");
    const crewBefore = G(client).ships["0"].stats!.crew.current;
    const gunners = Math.min(20, G(client).ships["1"].stats!.crew.current);
    client.moves.rollCannons();

    const [first] = G(client).combat!.volleys!;
    expect(first).toMatchObject({ shooterId: "1", guns: gunners });
    expect(first.locations!.crew).toBeGreaterThan(0);
    expect(G(client).combat!.stage).toBe("returnFire");
    client.moves.returnFire();
    const [, answer] = G(client).lastRound!.volleys;
    // The crew shot away before the attacker's answer was rolled.
    expect(answer).toMatchObject({ shooterId: "0", guns: Math.min(20, crewBefore - first.locations!.crew) });
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
    // Both guns hit (6s), then the hits land on the hull (1) and the masts (3)
    const dice = [6, 6, 1, 3];
    expect(applyCannons(G0, () => dice.shift()!, 1)).toBe("continues");
    expect(G0.combat!.volleys).toEqual([{ shooterId: "0", guns: 2, hits: 2, locations: { hull: 1, masts: 1, crew: 0 }, shots: [], dealt: { hull: 1, masts: 1, crew: 0 } }]);
    // The answer is the defender's own step
    expect(G0.combat!.stage).toBe("returnFire");
  });
});

/** Two ships at the ambush, by hand: the attacker with `guns` guns and `upgrades`, the defender with `answer` guns. */
function ambush(guns: number, answer: number, upgrades: string[] = [], npcFoe = false): CaribbeanState {
  return {
    ships: { "0": ship(0, 0, { cannons: guns, upgrades }), ...(npcFoe ? {} : { "1": ship(1, 0, { cannons: answer }) }) },
    npcs: npcFoe ? { foe: npc("FLOTILLA", { cannons: answer }) } : {},
    floatingLoot: [],
    combat: openFight("0", npcFoe ? "foe" : "1", 1, npcFoe),
  } as unknown as CaribbeanState;
}

/** Dice in the order given; the test fails if a step rolls more than it was given. */
function scripted(...dice: number[]) {
  return () => {
    const die = dice.shift();
    if (die === undefined) throw new Error("rolled more dice than scripted");
    return die;
  };
}

describe("every hit lands at random (#380)", () => {
  it("each hit of a volley rolls its own location after the guns', and the damage lands there", () => {
    const G0 = ambush(4, 2);
    // Four guns: three hit (5, 6, 6), one misses (2); the hits land on the hull, the masts and the crew
    applyCannons(G0, scripted(5, 2, 6, 6, 1, 4, 5), 1);
    expect(G0.combat!.volleys).toEqual([{ shooterId: "0", guns: 4, hits: 3, locations: { hull: 1, masts: 1, crew: 1 }, shots: [], dealt: { hull: 1, masts: 1, crew: 1 } }]);
    expect(G0.ships["1"].damage).toEqual({ hull: 1, masts: 1, crew: 1 });
    expect(G0.ships["1"].stats!.hull.current).toBe(39);
    expect(G0.ships["1"].stats!.crew.current).toBe(19);
  });

  it("mast hits past MAX_MAST_DAMAGE go to the hull", () => {
    const G0 = ambush(3, 0);
    applyCannons(G0, scripted(6, 6, 6, 3, 4, 3), 1);
    expect(G0.lastRound!.volleys[0].locations).toEqual({ hull: 0, masts: 3, crew: 0 });
    expect(G0.ships["1"].damage).toEqual({ hull: 1, masts: MAX_MAST_DAMAGE, crew: 0 });
  });

  it("each volley records the shots that added to it and the damage it dealt, as fired (#380)", () => {
    const G0 = ambush(3, 0, ["chain_shot"]);
    // Three hits, all on the masts: two masts and chain shot's +1 past the cap go to the hull
    applyCannons(G0, scripted(6, 6, 6, 3, 4, 3), 1);
    const [volley] = G0.lastRound!.volleys;
    expect(volley).toMatchObject({ locations: { hull: 0, masts: 3, crew: 0 }, shots: ["chain_shot"], dealt: { hull: 2, masts: MAX_MAST_DAMAGE, crew: 0 } });
    expect(G0.ships["1"].damage).toEqual(volley.dealt);
    // A miss records no shot and no damage
    const missed = ambush(2, 0, ["chain_shot", "grape_shot"]);
    applyCannons(missed, scripted(1, 1), 1);
    expect(missed.lastRound!.volleys[0]).toMatchObject({ hits: 0, shots: [], dealt: { hull: 0, masts: 0, crew: 0 } });
  });

  it("chain shot adds one to the masts when a hit lands there, grape shot one to the crew when a hit lands there", () => {
    const fire = (upgrades: string[], ...dice: number[]) => {
      const G0 = ambush(2, 0, upgrades);
      applyCannons(G0, scripted(...dice), 1);
      return G0.ships["1"].damage;
    };
    // Two hits, on the masts and the crew
    expect(fire([], 6, 6, 3, 5)).toEqual({ hull: 0, masts: 1, crew: 1 });
    expect(fire(["chain_shot"], 6, 6, 3, 5)).toEqual({ hull: 0, masts: 2, crew: 1 });
    expect(fire(["grape_shot"], 6, 6, 3, 5)).toEqual({ hull: 0, masts: 1, crew: 2 });
    expect(fire(["chain_shot", "grape_shot"], 6, 6, 3, 5)).toEqual({ hull: 0, masts: 2, crew: 2 });
    // Two hits on the hull: the shots add nothing
    expect(fire(["chain_shot", "grape_shot"], 6, 6, 1, 2)).toEqual({ hull: 2, masts: 0, crew: 0 });
  });

  it("an NPC fires the same way: its answer's hits each roll a location", () => {
    const G0 = ambush(1, 2, [], true);
    // The player's gun misses; the NPC's two hit, on the crew and the hull
    applyCannons(G0, scripted(1, 6, 5, 6, 2), 1);
    expect(G0.lastRound!.volleys).toEqual([
      { shooterId: "0", guns: 1, hits: 0, locations: { hull: 0, masts: 0, crew: 0 }, shots: [], dealt: { hull: 0, masts: 0, crew: 0 } },
      { shooterId: "foe", guns: 2, hits: 2, locations: { hull: 1, masts: 0, crew: 1 }, shots: [], dealt: { hull: 1, masts: 0, crew: 1 } },
    ]);
    expect(G0.ships["0"].damage).toEqual({ hull: 1, masts: 0, crew: 1 });
  });

  it("over many seeds, the hits spread over all three locations, and each volley's damage is its locations'", () => {
    const seen = { hull: 0, masts: 0, crew: 0 };
    for (let seed = 0; seed < 30; seed++) {
      const client = startGame({ "0": ship(0, 0, { cannons: 6 }), "1": ship(1, 0, { cannons: 6, crew: 40 }) }, {}, `random-hits-${seed}`);
      client.moves.attackShip("1");
      client.moves.rollCannons();
      const [volley] = G(client).combat!.volleys!;
      const at = volley.locations!;
      expect(at.hull + at.masts + at.crew).toBe(volley.hits);
      const masts = Math.min(at.masts, MAX_MAST_DAMAGE);
      expect(G(client).ships["1"].damage).toEqual({ hull: at.hull + at.masts - masts, masts, crew: at.crew });
      for (const where of ["hull", "masts", "crew"] as const) seen[where] += at[where];
    }
    expect(Math.min(seen.hull, seen.masts, seen.crew)).toBeGreaterThan(0);
  });

  it("one Fire! for every volley: rollCannons and returnFire take no aim, and refuse one sent by an old client", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 2 }), "1": ship(1, 0, { cannons: 2 }) });
    client.moves.attackShip("1");
    const before = JSON.stringify(G(client));
    for (const stray of ["hull", "masts", "guns", null, { aim: "hull" }]) client.moves.rollCannons(stray);
    expect(JSON.stringify(G(client))).toBe(before);

    client.moves.rollCannons();
    expect(G(client).combat!.stage).toBe("returnFire");
    const waiting = JSON.stringify(G(client));
    for (const stray of ["crew", null]) client.moves.returnFire(stray);
    expect(JSON.stringify(G(client))).toBe(waiting);
    client.moves.returnFire();
    expect(G(client).lastRound!.volleys.map((v) => v.shooterId)).toEqual(["0", "1"]);
  });
});

describe("the round settles itself (#380)", () => {
  it("the answer settles the round: no press, the draw is next, and the round's volleys stay in G.lastRound", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 4 }), "1": ship(1, 0, { cannons: 4 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    client.moves.returnFire();
    const after = G(client);
    expect(after.combat).toMatchObject({ round: 2, stage: "seamanship", volleys: [] });
    expect(after.lastRound).toMatchObject({ attackerId: "0", defenderId: "1", round: 1, ended: false, fleeOutcome: null });
    expect(after.lastRound!.volleys.map((v) => v.shooterId)).toEqual(["0", "1"]);
  });

  it("against an NPC one Fire! fires both volleys and settles the round", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 4 }) }, { foe: npc("FLOTILLA", { cannons: 4 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons();
    expect(G(client).combat).toMatchObject({ round: 2, stage: "seamanship" });
    expect(G(client).lastRound!.volleys.map((v) => v.shooterId)).toEqual(["0", "foe"]);
  });

  it("a volley that sinks the defender ends the fight in the same move, back to main, the round kept for the board", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }), "1": ship(1, 0, { cannons: 20, hull: 1 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    expect(G(client).combat).toBeUndefined();
    expect(G(client).ships["1"]).toBeUndefined();
    expect(client.getState()!.ctx.phase).toBe("main");
    expect(G(client).lastRound).toMatchObject({ round: 1, ended: true });
  });

  it("a new fight clears the last fight's round", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 2 }), "1": ship(1, 0) });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    expect(G(client).lastRound).toBeDefined();
    client.moves.rollSeamanship();
    client.moves.rollDefenderSeamanship();
    client.moves.chooseCombatAction("board");
    expect(G(client).combat).toBeUndefined();
    expect(G(client).lastRound!.round).toBe(1);
    // The next seat's turn: it attacks, and the old round goes
    client.moves.attackShip("0");
    expect(G(client).combat).toBeDefined();
    expect(G(client).lastRound).toBeUndefined();
  });

  it("a fight stored at the resolution before #380 still settles, by the legacy applyResolution move", () => {
    const client = startMidFight({ "0": ship(0, 0), "1": ship(1, 0, { hull: 0 }) }, { ...openFight("0", "1", 1, false), round: 2, stage: "resolution" });
    client.moves.applyResolution();
    expect(G(client).combat).toBeUndefined();
    expect(G(client).ships["1"]).toBeUndefined();
    expect(client.getState()!.ctx.phase).toBe("main");
  });

  it("the round records the ships it sank and left derelict, never one derelict before it", () => {
    const resolve = (defender: ShipState) => {
      const client = startMidFight({ "0": ship(0, 0), "1": defender }, { ...openFight("0", "1", 1, false), round: 2, stage: "resolution" });
      client.moves.applyResolution();
      return G(client).lastRound!;
    };
    expect(resolve(ship(1, 0, { hull: 0 }))).toMatchObject({ ended: true, sunk: ["1"], leftDerelict: [] });
    expect(resolve(ship(1, 0, { crew: 0 }))).toMatchObject({ ended: true, sunk: [], leftDerelict: ["1"] });
    expect(resolve({ ...ship(1, 0, { crew: 0 }), isDerelict: true })).toMatchObject({ sunk: [], leftDerelict: [] });
  });

  it("an NPC the round sank is recorded as sunk", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 30 }) }, { foe: npc("MERCHANT", { hull: 1 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons();
    expect(G(client).lastRound).toMatchObject({ ended: true, sunk: ["foe"], leftDerelict: [] });
  });

  it("refuses the legacy applyResolution at any other step", () => {
    const client = startGame({ "0": ship(0, 0, { cannons: 2 }), "1": ship(1, 0, { cannons: 2 }) });
    client.moves.attackShip("1");
    client.moves.rollCannons();
    const before = JSON.stringify(G(client));
    client.moves.applyResolution();
    expect(JSON.stringify(G(client))).toBe(before);
  });

  it("an NPC that catches a fleeing player fires the parting shot, and the fight ends with it", () => {
    /** The player (manoeuvrability 6, masts shot away) wins every draw against the NPC of 0 and flees. */
    const chase = (seed: number) => {
      const fleeing = ship(0, 0, { maneuverability: 6 });
      fleeing.damage.masts = MAX_MAST_DAMAGE;
      const client = startGame({ "0": fleeing }, { foe: npc("FLOTILLA", { cannons: 4 }) }, `npc-chase-${seed}`);
      client.moves.attackNPC("foe");
      client.moves.rollCannons();
      client.moves.rollSeamanship();
      client.moves.chooseCombatAction("flee");
      client.moves.rollFleeAttempt();
      return client;
    };
    const seed = Array.from({ length: 60 }, (_, i) => i).find((i) => G(chase(i)).combat?.fleeOutcome === "caught");
    expect(seed).toBeDefined();
    const client = chase(seed!);
    expect(G(client).combat).toMatchObject({ stage: "cannons", fleeOutcome: "caught", seamanshipWinner: "0" });

    // The player presses the NPC's parting shot
    client.moves.rollCannons();
    expect(G(client).combat).toBeUndefined();
    expect(client.getState()!.ctx.phase).toBe("main");
    expect(G(client).lastRound).toMatchObject({ fleeOutcome: "caught", ended: true, volleys: [expect.objectContaining({ shooterId: "foe" })] });
  });

  it("an NPC that fires first, and the player then answers on its own step", () => {
    // The NPC is never outgunned, whatever the ambush's hits on its crew, so it fires
    const client = startGame({ "0": ship(0, 0, { cannons: 20 }) }, { foe: npc("FLOTILLA", { cannons: 30, crew: 60, maneuverability: 20 }) });
    client.moves.attackNPC("foe");
    client.moves.rollCannons();
    client.moves.rollSeamanship();
    expect(G(client).combat).toMatchObject({ seamanshipWinner: "foe", actionChosen: "fire", stage: "cannons" });

    client.moves.rollCannons();
    expect(G(client).combat!.volleys!.map((v) => v.shooterId)).toEqual(["foe"]);
    expect(G(client).combat!.stage).toBe("returnFire");

    client.moves.returnFire();
    expect(G(client).lastRound!.volleys.map((v) => v.shooterId)).toEqual(["foe", "0"]);
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

  it("the pursuer fires the parting shot at the ship it caught, nobody answers it, and the fight ends", () => {
    const seed = Array.from({ length: 60 }, (_, i) => i).find((i) => caught(flight(i, MAX_MAST_DAMAGE)));
    expect(seed).toBeDefined();
    const client = flight(seed!, MAX_MAST_DAMAGE);
    expect(G(client).combat).toMatchObject({ fleeOutcome: "caught", stage: "cannons" });

    client.moves.rollCannons();
    expect(G(client).combat).toBeUndefined();
    expect(G(client).lastRound!.volleys).toEqual([expect.objectContaining({ shooterId: "0" })]);
  });
});

describe("the volleys fired by a step (#348, #380)", () => {
  const volley = (shooterId: string, hits: number) => ({ shooterId, guns: 4, hits, locations: { hull: hits, masts: 0, crew: 0 } });
  const fight = { attackerId: "0", defenderId: "1", round: 2 };
  const at = (stage: CombatStage, volleys = [] as ReturnType<typeof volley>[], round = 2) => ({ ...fight, round, stage, volleys });
  const settled = (volleys: ReturnType<typeof volley>[], ended = false) => ({ ...fight, isNPCCombat: false, volleys, fleeOutcome: null, fleeRolls: null, ended, sunk: [], leftDerelict: [] });

  it("isVolleyStage: the cannons and the answer, no other step", () => {
    expect(COMBAT_STAGES.filter(isVolleyStage)).toEqual(["cannons", "returnFire"]);
  });

  it("the first volley as the answer waits, then only the answer from the settled round", () => {
    expect(volleysFired(at("cannons"), { combat: at("returnFire", [volley("0", 2)]) as CombatState })).toEqual([volley("0", 2)]);
    const next = { combat: at("seamanship", [], 3) as CombatState, lastRound: settled([volley("0", 2), volley("1", 1)]) };
    expect(volleysFired(at("returnFire", [volley("0", 2)]), next)).toEqual([volley("1", 1)]);
    expect(volleysFired(at("cannons"), next)).toEqual([volley("0", 2), volley("1", 1)]);
  });

  it("every volley of a round that ended the fight, read from the settled round", () => {
    expect(volleysFired(at("cannons"), { lastRound: settled([volley("0", 3)], true) })).toEqual([volley("0", 3)]);
  });

  it("none at any other step, nor for a refused step, nor from a round settled earlier", () => {
    expect(volleysFired(at("seamanship"), { combat: at("chooseAction") as CombatState })).toEqual([]);
    expect(volleysFired(at("cannons"), { combat: at("cannons") as CombatState })).toEqual([]);
    expect(volleysFired(at("cannons"), {})).toEqual([]);
    expect(volleysFired(at("cannons"), { lastRound: { ...settled([volley("0", 3)], true), round: 1 } })).toEqual([]);
  });
});

describe("a ship out of range never fires first (#356)", () => {
  /**
   * A fight at distance 2: the attacker (long guns, two guns) against a
   * defender of manoeuvrability 20, which wins every draw, with long guns or
   * without, through the ambush and on to round 2's draw won by the defender.
   */
  function atTwoHexes(defenderUpgrades: string[]) {
    const client = startGame({
      "0": ship(0, 0, { cannons: 2, upgrades: ["long_guns"] }),
      "1": ship(2, 0, { cannons: 4, maneuverability: 20, upgrades: defenderUpgrades }),
    });
    client.moves.attackShip("1");
    expect(G(client).combat!.distance).toBe(2);
    fireTheAmbush(client);
    client.moves.rollSeamanship();
    client.moves.rollDefenderSeamanship();
    expect(G(client).combat).toMatchObject({ round: 2, stage: "chooseAction", seamanshipWinner: "1" });
    return client;
  }

  it("the draw's winner without long guns may not fire from 2 hexes, nor board: it may only flee", () => {
    const client = atTwoHexes([]);
    const before = JSON.stringify(G(client).combat);
    client.moves.chooseCombatAction("fire");
    client.moves.chooseCombatAction("board");
    expect(JSON.stringify(G(client).combat)).toBe(before);

    client.moves.chooseCombatAction("flee");
    expect(G(client).combat).toMatchObject({ actionChosen: "flee", stage: "fleeAttempt" });
  });

  it("an NPC that wins the draw 2 hexes off, never outgunned, cannot fire: it flees instead", () => {
    const foe = { ...npc("FLOTILLA", { cannons: 20, maneuverability: 20 }), position: hex(2, 0) };
    const client = startGame({ "0": ship(0, 0, { cannons: 2, upgrades: ["long_guns"] }) }, { foe });
    client.moves.attackNPC("foe");
    expect(G(client).combat!.distance).toBe(2);
    fireTheAmbush(client);
    client.moves.rollSeamanship();
    expect(G(client).combat).toMatchObject({ round: 2, seamanshipWinner: "foe", actionChosen: "flee", stage: "fleeAttempt" });
    expect(firstToFireReaches(G(client))).toBe(false);
  });

  it("a pursuer out of range that catches a flight 2 hexes off fires no parting shot, and the fight ends", () => {
    /** The attacker (long guns, manoeuvrability 6, masts shot away) wins every draw against the defender of 0 and flees. */
    const chase = (seed: number) => {
      const fleeing = ship(0, 0, { cannons: 2, maneuverability: 6, upgrades: ["long_guns"] });
      fleeing.damage.masts = MAX_MAST_DAMAGE;
      const client = startGame({ "0": fleeing, "1": ship(2, 0, { cannons: 20 }) }, {}, `far-chase-${seed}`);
      client.moves.attackShip("1");
      fireTheAmbush(client);
      client.moves.rollSeamanship();
      client.moves.rollDefenderSeamanship();
      client.moves.chooseCombatAction("flee");
      client.moves.rollFleeAttempt();
      return client;
    };
    const seed = Array.from({ length: 60 }, (_, i) => i).find((i) => G(chase(i)).lastRound?.fleeOutcome === "caught");
    expect(seed).toBeDefined();
    const client = chase(seed!);
    // The round settles itself at once (#380): no parting shot, and the fight is over
    expect(G(client).combat).toBeUndefined();
    expect(client.getState()!.ctx.phase).toBe("main");
    expect(G(client).lastRound).toMatchObject({ fleeOutcome: "caught", ended: true, volleys: [] });
    expect(G(client).ships["0"].stats!.hull.current).toBe(40);
  });

  it("the draw's winner with long guns fires first from 2 hexes, and the attacker answers", () => {
    const client = atTwoHexes(["long_guns"]);
    client.moves.chooseCombatAction("fire");
    client.moves.rollCannons();
    client.moves.returnFire();
    expect(G(client).lastRound!.volleys.map((v) => v.shooterId)).toEqual(["1", "0"]);
  });
});

describe("round-1 fights stored before #346 (#356)", () => {
  it("after a caught flight in which the attacker fled, the pursuer (the defender) fires the parting shot", () => {
    const combat = { round: 1, stage: "cannons", attackerId: "0", defenderId: "1", seamanshipWinner: "0", fleeOutcome: "caught" } as const;
    expect(volleyShooter(combat)).toBe("1");
  });

  /** A round-1 draw against an NPC (from before #346): the NPC, outgunned and faster, wins it. */
  function legacyNPCDraw(npcAt: number): CaribbeanState {
    const foe = { ...npc("FLOTILLA", { cannons: 1, maneuverability: 20 }), position: hex(npcAt, 0) };
    return {
      ships: { "0": ship(0, 0, { cannons: 20, upgrades: ["long_guns"] }) },
      npcs: { foe },
      floatingLoot: [],
      combat: { ...openFight("0", "foe", npcAt, true), stage: "seamanship", actionChosen: null },
    } as unknown as CaribbeanState;
  }

  it("an outgunned NPC that wins it in range fires: round 1 offers no flight", () => {
    const G0 = legacyNPCDraw(1);
    applyRollSeamanship(G0, () => 1);
    expect(G0.combat).toMatchObject({ seamanshipWinner: "foe", actionChosen: "fire", stage: "cannons" });
  });

  it("an NPC that wins it out of range still fires: in round 1 the attacker fires first, and it reaches", () => {
    const G0 = legacyNPCDraw(2);
    applyRollSeamanship(G0, () => 1);
    expect(G0.combat).toMatchObject({ seamanshipWinner: "foe", actionChosen: "fire", stage: "cannons" });
  });
});
