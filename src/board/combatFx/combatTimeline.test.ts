import { describe, expect, it } from "vitest";
import { combatBeatsFrom, type CombatBeat, type VolleyBeat } from "./combatTimeline";
import type { CaribbeanState, CombatState, NPCShip, ShipClass, ShipState, VolleyAim } from "../../game/types";
import { hex } from "../../game/hex";
import { emptyCargo } from "../../game/economy";
import { SHIP_SPECS } from "../../game/constants";

const statsOf = (shipClass: ShipClass) => {
  const spec = SHIP_SPECS[shipClass];
  return { ...spec, crew: { ...spec.crew }, hull: { ...spec.hull } };
};

function makeShip(shipClass: ShipClass, overrides: Partial<ShipState> = {}): ShipState {
  return {
    position: hex(0, 0),
    cargo: emptyCargo(),
    gold: 100,
    maxCargo: 10,
    upgrades: [],
    damage: { hull: 0, crew: 0, masts: 0 },
    bounties: { England: 0, France: 0, Spain: 0, Netherlands: 0 },
    score: 0,
    stashedGold: 0,
    scoutedShips: [],
    shipClass,
    stats: statsOf(shipClass),
    ...overrides,
  };
}

function makeNpc(overrides: Partial<NPCShip> = {}): NPCShip {
  return {
    id: "npc-1",
    position: hex(1, 0),
    cargo: emptyCargo(),
    gold: 20,
    shipClass: "Flute",
    stats: statsOf("Flute"),
    damage: { hull: 0, crew: 0, masts: 0 },
    nation: "Spain",
    aiBehavior: "MERCHANT_ROUTE",
    destinationPortHex: hex(9, 9),
    spawnPortHex: hex(1, 1),
    isIdentified: false,
    bounty: 1,
    role: "MERCHANT",
    huntingTargetId: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<CaribbeanState> = {}): CaribbeanState {
  return {
    cells: [],
    // A Frigate (4 guns) and a Sloop (2 guns) one hex apart.
    ships: { "0": makeShip("Frigate"), "1": makeShip("Sloop", { position: hex(1, 0) }) },
    npcs: {},
    mapSize: "small",
    mapSeed: 42,
    wrap: null,
    captainDeck: [],
    draftHands: {},
    floatingLoot: [],
    npcIdCounter: 0,
    ...overrides,
  };
}

function makeCombat(overrides: Partial<CombatState> = {}): CombatState {
  return {
    attackerId: "0",
    defenderId: "1",
    round: 1,
    stage: "seamanship",
    seamanshipWinner: null,
    seamanshipRolls: {},
    actionChosen: null,
    attackerHits: 0,
    defenderHits: 0,
    volleys: [],
    distance: 1,
    isNPCCombat: false,
    fleeOutcome: null,
    fleeRolls: null,
    ...overrides,
  };
}

/** A volley as the cannons record it (#346): who fired, how many guns, how many hit, and where it was aimed (#348). */
const fired = (shooterId: string, guns: number, hits: number, aim: VolleyAim = "hull") => ({ shooterId, guns, aim, hits });

const volleyOf = (beats: CombatBeat[]): VolleyBeat => {
  const volley = beats.find((b): b is VolleyBeat => b.kind === "volley");
  if (!volley) throw new Error("no volley");
  return volley;
};

describe("the combat timeline: G's changes as beats the table watches (#263)", () => {
  it("plays nothing for the first state, or when nothing changed", () => {
    const state = makeState();
    expect(combatBeatsFrom(undefined, state)).toEqual([]);
    expect(combatBeatsFrom(state, state)).toEqual([]);
  });

  it("declares when a fight starts: the attacker and the defender turn to bear", () => {
    const beats = combatBeatsFrom(makeState(), makeState({ combat: makeCombat() }));
    expect(beats).toEqual([expect.objectContaining({ kind: "declare", attackerId: "0", defenderId: "1" })]);
  });

  it("a volley fires every gun the rules rolled, one after another, both ships", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const after = makeState({ combat: makeCombat({ stage: "resolution", volleys: [fired("0", 4, 3), fired("1", 2, 1)] }) });
    const volley = volleyOf(combatBeatsFrom(before, after));
    const [attack, reply] = volley.volleys;
    expect(attack).toMatchObject({ shooterId: "0", targetId: "1" });
    expect(attack.shots).toHaveLength(4); // the Frigate's four guns
    expect(attack.shots.filter((s) => s.hit)).toHaveLength(3);
    expect(reply).toMatchObject({ shooterId: "1", targetId: "0" });
    expect(reply.shots).toHaveLength(2); // the Sloop's two
    expect(reply.shots.filter((s) => s.hit)).toHaveLength(1);
    // Each gun in turn, each shot landing after it is fired, the reply after the attack.
    const times = [...attack.shots, ...reply.shots].map((s) => s.fireAt);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
    for (const s of [...attack.shots, ...reply.shots]) expect(s.landAt).toBeGreaterThan(s.fireAt);
    expect(reply.shots[0].fireAt).toBeGreaterThan(attack.shots[attack.shots.length - 1].fireAt);
    // The beat lasts until the last shot has landed.
    expect(volley.seconds).toBeGreaterThanOrEqual(reply.shots[1].landAt);
  });

  it("the volleys play in the order they were fired: the draw's winner first, then the answer (#346)", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons", round: 2, seamanshipWinner: "1" }) });
    const after = makeState({ combat: makeCombat({ stage: "resolution", round: 2, seamanshipWinner: "1", volleys: [fired("1", 2, 1), fired("0", 4, 0)] }) });
    const volleys = volleyOf(combatBeatsFrom(before, after)).volleys;
    expect(volleys.map((v) => [v.shooterId, v.targetId])).toEqual([["1", "0"], ["0", "1"]]);
  });

  it("each volley fires the guns it was rolled with, though the answer has since thinned the crew (#346)", () => {
    const frigate = makeShip("Frigate");
    frigate.stats!.crew.current = 1;
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const after = makeState({ ships: { ...before.ships, "0": frigate }, combat: makeCombat({ stage: "resolution", volleys: [fired("0", 4, 1), fired("1", 2, 1)] }) });
    expect(volleyOf(combatBeatsFrom(before, after)).volleys[0].shots).toHaveLength(4);
  });

  it("a ship that did not answer fires nothing back", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons", distance: 2 }) });
    const after = makeState({ combat: makeCombat({ stage: "resolution", distance: 2, volleys: [fired("0", 4, 1)] }) });
    expect(volleyOf(combatBeatsFrom(before, after)).volleys.map((v) => v.shooterId)).toEqual(["0"]);
  });

  it("a caught ship takes the pursuer's parting shot and does not reply", () => {
    // Ship 1 won the seamanship, fled, and was caught.
    const caught = { seamanshipWinner: "1", fleeOutcome: "caught" as const };
    const before = makeState({ combat: makeCombat({ ...caught, stage: "cannons" }) });
    const after = makeState({ combat: makeCombat({ ...caught, stage: "resolution", volleys: [fired("0", 4, 2)] }) });
    const volleys = volleyOf(combatBeatsFrom(before, after)).volleys;
    expect(volleys.map((v) => [v.shooterId, v.targetId])).toEqual([["0", "1"]]);
  });

  it("a volley with no gun to fire plays nothing", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const after = makeState({ combat: makeCombat({ stage: "resolution", volleys: [fired("0", 0, 0)] }) });
    expect(combatBeatsFrom(before, after)).toEqual([]);
  });

  it("a fight stored before #346, with no volleys recorded, plays none", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const { volleys: _volleys, ...legacy } = makeCombat({ stage: "resolution", attackerHits: 2 });
    void _volleys;
    expect(combatBeatsFrom(before, makeState({ combat: legacy }))).toEqual([]);
  });

  it("which shots hit is seeded: the same on every seat, different from fight to fight", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const after = makeState({ combat: makeCombat({ stage: "resolution", volleys: [fired("0", 4, 2)] }) });
    const hits = (state: CaribbeanState) => volleyOf(combatBeatsFrom(before, state)).volleys[0].shots.map((s) => s.hit);
    expect(hits(after)).toEqual(hits(structuredClone(after)));
    const patterns = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((round) => hits(makeState({ combat: makeCombat({ stage: "resolution", volleys: [fired("0", 4, 2)], round }) })).join())
    );
    expect(patterns.size).toBeGreaterThan(1);
  });

  it("a volley aimed at the masts that hits brings a mast down (#348); one aimed elsewhere never does", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const ships = { ...before.ships, "0": makeShip("Frigate", { upgrades: ["chain_shot"] }) };
    const falls = (volley: ReturnType<typeof fired>) =>
      volleyOf(combatBeatsFrom({ ...before, ships }, makeState({ ships, combat: makeCombat({ stage: "resolution", volleys: [volley] }) }))).volleys[0].mastFalls;
    expect(falls(fired("0", 4, 1, "masts"))).toBe(true);
    expect(falls(fired("0", 4, 0, "masts"))).toBe(false);
    expect(falls(fired("0", 4, 3, "hull"))).toBe(false);
    expect(falls(fired("0", 4, 3, "crew"))).toBe(false);
  });

  it("the first volley plays as it is fired, while the answer waits on its aim (#348)", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const waiting = makeState({ combat: makeCombat({ stage: "returnFire", volleys: [fired("0", 4, 2)] }) });
    expect(volleyOf(combatBeatsFrom(before, waiting)).volleys.map((v) => v.shooterId)).toEqual(["0"]);
  });

  it("the answer plays on its own as it is fired, not the first volley again (#348)", () => {
    const waiting = makeState({ combat: makeCombat({ stage: "returnFire", volleys: [fired("0", 4, 2)] }) });
    const answered = makeState({ combat: makeCombat({ stage: "resolution", volleys: [fired("0", 4, 2), fired("1", 2, 1, "crew")] }) });
    const volleys = volleyOf(combatBeatsFrom(waiting, answered)).volleys;
    expect(volleys.map((v) => [v.shooterId, v.targetId])).toEqual([["1", "0"]]);
    expect(volleyOf(combatBeatsFrom(waiting, answered)).seedKey).not.toBe(volleyOf(combatBeatsFrom(makeState({ combat: makeCombat({ stage: "cannons" }) }), waiting)).seedKey);
  });

  it("a flight that escapes, and one that is caught", () => {
    const fleeing = { stage: "fleeAttempt" as const, seamanshipWinner: "1" };
    const before = makeState({ combat: makeCombat(fleeing) });
    expect(combatBeatsFrom(before, makeState())).toEqual([
      expect.objectContaining({ kind: "flee", fleeingId: "1", pursuerId: "0", outcome: "escaped" }),
    ]);
    const caught = makeState({ combat: makeCombat({ ...fleeing, stage: "cannons", fleeOutcome: "caught" }) });
    expect(combatBeatsFrom(before, caught)).toEqual([
      expect.objectContaining({ kind: "flee", fleeingId: "1", pursuerId: "0", outcome: "caught" }),
    ]);
    // Caught by a pursuer out of range: no parting shot, straight to the round's end (#356)
    const caughtOutOfRange = makeState({ combat: makeCombat({ ...fleeing, stage: "resolution", fleeOutcome: "caught" }) });
    expect(combatBeatsFrom(before, caughtOutOfRange)).toEqual([
      expect.objectContaining({ kind: "flee", fleeingId: "1", pursuerId: "0", outcome: "caught" }),
    ]);
  });

  it("boarding a merchant brings the ships alongside", () => {
    const npc = makeNpc();
    const before = makeState({ npcs: { [npc.id]: npc }, combat: makeCombat({ stage: "chooseAction", defenderId: npc.id, isNPCCombat: true }) });
    const after = makeState({ npcs: {} });
    expect(combatBeatsFrom(before, after)).toEqual([expect.objectContaining({ kind: "closeAlongside", attackerId: "0", defenderId: npc.id })]);
  });

  it("a ship that goes down as wreckage appears sinks, holed from the shooter's side", () => {
    const before = makeState({ combat: makeCombat({ stage: "resolution", attackerHits: 9 }) });
    const after = makeState({
      ships: { "0": before.ships["0"] },
      floatingLoot: [{ id: "loot-1", hex: hex(1, 0), cargo: emptyCargo(), gold: 0 }],
    });
    expect(combatBeatsFrom(before, after)).toEqual([expect.objectContaining({ kind: "sink", shipId: "1", shooterId: "0" })]);
  });

  it("a seat's fresh ship after its captain was lost (#277) is not a sinking, nor anything else", () => {
    const lost = makeState({ ships: { "0": makeShip("Frigate") } });
    const back = makeState({ ships: { "0": makeShip("Frigate"), "1": makeShip("Sloop", { position: hex(7, 7) }) } });
    expect(combatBeatsFrom(lost, back)).toEqual([]);
  });

  it("an NPC sunk in a fight sinks too", () => {
    const npc = makeNpc();
    const before = makeState({ npcs: { [npc.id]: npc }, combat: makeCombat({ stage: "resolution", defenderId: npc.id, isNPCCombat: true }) });
    const after = makeState({ npcs: {}, floatingLoot: [{ id: "loot-1", hex: npc.position, cargo: emptyCargo(), gold: 0 }] });
    expect(combatBeatsFrom(before, after)).toEqual([expect.objectContaining({ kind: "sink", shipId: npc.id, shooterId: "0" })]);
  });

  it("names each beat for its fight, round and move, so its effects are seeded alike on every seat", () => {
    const volleyIn = (round: number) =>
      combatBeatsFrom(
        makeState({ combat: makeCombat({ stage: "cannons", round }) }),
        makeState({ combat: makeCombat({ stage: "resolution", round, volleys: [fired("0", 4, 1)] }) })
      )[0].seedKey;
    expect(volleyIn(1)).toBe(volleyIn(1));
    expect(volleyIn(2)).not.toBe(volleyIn(1));
    const [declare] = combatBeatsFrom(makeState(), makeState({ combat: makeCombat() }));
    expect(declare.seedKey).not.toBe(volleyIn(1));
  });

  it("reduced motion plays shorter beats", () => {
    const before = makeState();
    const after = makeState({ combat: makeCombat() });
    const [full] = combatBeatsFrom(before, after);
    const [short] = combatBeatsFrom(before, after, { reducedMotion: true });
    expect(short.seconds).toBeLessThan(full.seconds);
  });
});
