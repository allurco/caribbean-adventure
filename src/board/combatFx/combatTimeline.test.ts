import { describe, expect, it } from "vitest";
import { combatBeatsFrom, type CombatBeat, type VolleyBeat, mastFalls } from "./combatTimeline";
import type { CaribbeanState, CombatState, HitLocation, NPCShip, ShipClass, ShipState, Volley } from "../../game/types";
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

/** A volley as the cannons record it (#346): who fired, how many guns, how many hit, and where they landed (#380), all on `on`. */
const fired = (shooterId: string, guns: number, hits: number, on: HitLocation = "hull"): Volley => ({
  shooterId,
  guns,
  hits,
  locations: { hull: 0, masts: 0, crew: 0, [on]: hits },
});

/**
 * The state after a round settled itself (#380): the fight on to the next
 * round's draw, or over (`ended`), and the round kept in `G.lastRound`.
 */
function settled(fight: Partial<CombatState>, volleys: Volley[], extra: Partial<CaribbeanState> = {}, ended = false): CaribbeanState {
  const combat = makeCombat(fight);
  return makeState({
    combat: ended ? undefined : { ...combat, round: combat.round + 1, stage: "seamanship", volleys: [], fleeOutcome: null, fleeRolls: null, seamanshipWinner: null },
    lastRound: { attackerId: combat.attackerId, defenderId: combat.defenderId, isNPCCombat: combat.isNPCCombat, round: combat.round, volleys, fleeOutcome: combat.fleeOutcome, fleeRolls: combat.fleeRolls, ended, sunk: [], leftDerelict: [] },
    ...extra,
  });
}

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
    const after = settled({}, [fired("0", 4, 3), fired("1", 2, 1)]);
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
    const after = settled({ round: 2, seamanshipWinner: "1" }, [fired("1", 2, 1), fired("0", 4, 0)]);
    const volleys = volleyOf(combatBeatsFrom(before, after)).volleys;
    expect(volleys.map((v) => [v.shooterId, v.targetId])).toEqual([["1", "0"], ["0", "1"]]);
  });

  it("each volley fires the guns it was rolled with, though the answer has since thinned the crew (#346)", () => {
    const frigate = makeShip("Frigate");
    frigate.stats!.crew.current = 1;
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const after = settled({}, [fired("0", 4, 1), fired("1", 2, 1)], { ships: { ...before.ships, "0": frigate } });
    expect(volleyOf(combatBeatsFrom(before, after)).volleys[0].shots).toHaveLength(4);
  });

  it("a ship that did not answer fires nothing back", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons", distance: 2 }) });
    const after = settled({ distance: 2 }, [fired("0", 4, 1)]);
    expect(volleyOf(combatBeatsFrom(before, after)).volleys.map((v) => v.shooterId)).toEqual(["0"]);
  });

  it("a caught ship takes the pursuer's parting shot and does not reply", () => {
    // Ship 1 won the seamanship, fled, and was caught.
    const caught = { seamanshipWinner: "1", fleeOutcome: "caught" as const };
    const before = makeState({ combat: makeCombat({ ...caught, stage: "cannons" }) });
    const after = settled({ ...caught }, [fired("0", 4, 2)]);
    const volleys = volleyOf(combatBeatsFrom(before, after)).volleys;
    expect(volleys.map((v) => [v.shooterId, v.targetId])).toEqual([["0", "1"]]);
  });

  it("a volley with no gun to fire plays nothing", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const after = settled({}, [fired("0", 0, 0)]);
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
    const after = settled({}, [fired("0", 4, 2)]);
    const hits = (state: CaribbeanState, from = before) => volleyOf(combatBeatsFrom(from, state)).volleys[0].shots.map((s) => s.hit);
    expect(hits(after)).toEqual(hits(structuredClone(after)));
    const patterns = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((round) => hits(settled({ round }, [fired("0", 4, 2)]), makeState({ combat: makeCombat({ stage: "cannons", round }) })).join())
    );
    expect(patterns.size).toBeGreaterThan(1);
  });

  it("a volley aimed at the masts that hits brings a mast down (#348); one aimed elsewhere never does", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const ships = { ...before.ships, "0": makeShip("Frigate", { upgrades: ["chain_shot"] }) };
    const falls = (volley: ReturnType<typeof fired>) =>
      volleyOf(combatBeatsFrom({ ...before, ships }, settled({}, [volley], { ships }))).volleys[0].mastFalls;
    expect(falls(fired("0", 4, 1, "masts"))).toBe(true);
    expect(falls(fired("0", 4, 0, "masts"))).toBe(false);
    expect(falls(fired("0", 4, 3, "hull"))).toBe(false);
    expect(falls(fired("0", 4, 3, "crew"))).toBe(false);
    // A hit landing on the masts among others brings one down too (#380)
    expect(falls({ shooterId: "0", guns: 4, hits: 3, locations: { hull: 2, masts: 1, crew: 0 } })).toBe(true);
    // A volley stored before #380, aimed at the masts
    expect(falls({ shooterId: "0", guns: 4, hits: 1, aim: "masts" })).toBe(true);
  });

  it("mastFalls: only a volley that dealt mast damage brings a mast down, never one whose mast hits all went to the hull", () => {
    const at = (hull: number, masts: number, crew: number) => ({ hull, masts, crew });
    expect(mastFalls({ shooterId: "0", guns: 4, hits: 2, locations: at(0, 2, 0), dealt: at(1, 1, 0) })).toBe(true);
    // The masts already gone: every mast hit went to the hull
    expect(mastFalls({ shooterId: "0", guns: 4, hits: 2, locations: at(0, 2, 0), dealt: at(2, 0, 0) })).toBe(false);
    expect(mastFalls({ shooterId: "0", guns: 4, hits: 1, locations: at(1, 0, 0), dealt: at(1, 0, 0) })).toBe(false);
    // Stored without its damage (save version 9): a hit on the masts is enough
    expect(mastFalls({ shooterId: "0", guns: 4, hits: 1, locations: at(0, 1, 0) })).toBe(true);
  });

  it("the first volley plays as it is fired, while the answer waits on its aim (#348)", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const waiting = makeState({ combat: makeCombat({ stage: "returnFire", volleys: [fired("0", 4, 2)] }) });
    expect(volleyOf(combatBeatsFrom(before, waiting)).volleys.map((v) => v.shooterId)).toEqual(["0"]);
  });

  it("the answer plays on its own as it is fired, not the first volley again (#348)", () => {
    const waiting = makeState({ combat: makeCombat({ stage: "returnFire", volleys: [fired("0", 4, 2)] }) });
    const answered = settled({}, [fired("0", 4, 2), fired("1", 2, 1, "crew")]);
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
    // Caught by a pursuer out of range: no parting shot (#356), and the round settles, ending the fight at once (#380)
    const caughtOutOfRange = settled({ ...fleeing, fleeOutcome: "caught" }, [], {}, true);
    expect(combatBeatsFrom(before, caughtOutOfRange)).toEqual([
      expect.objectContaining({ kind: "flee", fleeingId: "1", pursuerId: "0", outcome: "caught" }),
    ]);
    // A round settled earlier in the fight is no flight's outcome: a fight that ends from the flight escaped
    const earlier = makeState({ lastRound: { ...settled({}, []).lastRound!, round: 0 } });
    expect(combatBeatsFrom(before, earlier)).toEqual([expect.objectContaining({ kind: "flee", outcome: "escaped" })]);
  });

  it("boarding a merchant brings the ships alongside, as Board is chosen (#350)", () => {
    const npc = makeNpc();
    const combat = makeCombat({ stage: "chooseAction", defenderId: npc.id, isNPCCombat: true });
    const before = makeState({ npcs: { [npc.id]: npc }, combat });
    const after = makeState({ npcs: { [npc.id]: npc }, combat: { ...combat, stage: "boarding", actionChosen: "board" } });
    expect(combatBeatsFrom(before, after)).toEqual([expect.objectContaining({ kind: "closeAlongside", attackerId: "0", defenderId: npc.id })]);
  });

  it("an NPC that strikes to a boarding is taken, not sunk, though its cargo floats (#350)", () => {
    const npc = makeNpc();
    const before = makeState({ npcs: { [npc.id]: npc }, combat: makeCombat({ stage: "boarding", defenderId: npc.id, isNPCCombat: true, actionChosen: "board" }) });
    const after = makeState({ npcs: {}, floatingLoot: [{ id: "loot-1", hex: hex(1, 0), cargo: emptyCargo(), gold: 0 }] });
    expect(combatBeatsFrom(before, after)).toEqual([]);
  });

  it("a ship that goes down as wreckage appears sinks, holed from the shooter's side", () => {
    const before = makeState({ combat: makeCombat({ stage: "resolution", attackerHits: 9 }) });
    const after = makeState({
      ships: { "0": before.ships["0"] },
      floatingLoot: [{ id: "loot-1", hex: hex(1, 0), cargo: emptyCargo(), gold: 0 }],
    });
    expect(combatBeatsFrom(before, after)).toEqual([expect.objectContaining({ kind: "sink", shipId: "1", shooterId: "0" })]);
  });

  it("the volley that sinks a ship and ends the fight still plays, from where she lay, before she sinks (#380)", () => {
    const before = makeState({ combat: makeCombat({ stage: "cannons" }) });
    const after = settled({}, [fired("0", 4, 3)], {
      ships: { "0": before.ships["0"] },
      floatingLoot: [{ id: "loot-1", hex: hex(1, 0), cargo: emptyCargo(), gold: 0 }],
    }, true);
    const beats = combatBeatsFrom(before, after);
    expect(beats.map((b) => b.kind)).toEqual(["volley", "sink"]);
    expect(volleyOf(beats).volleys.map((v) => [v.shooterId, v.targetId])).toEqual([["0", "1"]]);
    expect(volleyOf(beats).volleys[0].shots.filter((s) => s.hit)).toHaveLength(3);
  });

  it("the answer that settles the round plays once, as the fight goes on to the next draw (#380)", () => {
    const waiting = makeState({ combat: makeCombat({ stage: "returnFire", volleys: [fired("0", 4, 2)] }) });
    const next = settled({}, [fired("0", 4, 2), fired("1", 2, 1)]);
    expect(volleyOf(combatBeatsFrom(waiting, next)).volleys.map((v) => v.shooterId)).toEqual(["1"]);
    // The next state of the same fight plays no volley again
    expect(combatBeatsFrom(next, { ...next, combat: { ...next.combat!, stage: "defenderSeamanship" } }).filter((b) => b.kind === "volley")).toEqual([]);
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
        settled({ round }, [fired("0", 4, 1)])
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
