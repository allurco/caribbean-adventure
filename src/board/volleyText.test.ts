import { describe, expect, it } from "vitest";
import { answerLine, fightOverLines, pendingVolley, pursuitRollsLine, roundShown, volleyLine } from "./volleyText";
import type { CaribbeanState, CombatState, SettledRound } from "../game/types";

const fight = (extra: Partial<CombatState>): CombatState => ({
  attackerId: "0",
  defenderId: "1",
  round: 1,
  stage: "cannons",
  seamanshipWinner: null,
  seamanshipRolls: {},
  actionChosen: "fire",
  attackerHits: 0,
  defenderHits: 0,
  volleys: [],
  distance: 1,
  isNPCCombat: false,
  fleeOutcome: null,
  fleeRolls: null,
  ...extra,
});

describe("pendingVolley: the volley the fight waits on, and who fires it", () => {
  it("the ambush is the attacker's to fire, and the answer the defender's", () => {
    expect(pendingVolley(fight({}))).toEqual({ shooterId: "0" });
    expect(pendingVolley(fight({ stage: "returnFire" }))).toEqual({ shooterId: "1" });
  });

  it("from round 2 the draw's winner fires first, and the pursuer fires a parting shot", () => {
    expect(pendingVolley(fight({ round: 2, seamanshipWinner: "1" }))).toEqual({ shooterId: "1" });
    expect(pendingVolley(fight({ round: 2, seamanshipWinner: "1", stage: "returnFire" }))).toEqual({ shooterId: "0" });
    expect(pendingVolley(fight({ round: 2, seamanshipWinner: "1", fleeOutcome: "caught" }))).toEqual({ shooterId: "0" });
  });

  it("is nothing at any other step", () => {
    for (const stage of ["seamanship", "defenderSeamanship", "chooseAction", "fleeAttempt", "resolution"] as const) {
      expect(pendingVolley(fight({ stage }))).toBeNull();
    }
  });
});

describe("volleyLine: a fired volley, in words (#380)", () => {
  const at = (hull: number, masts: number, crew: number) => ({ hull, masts, crew });

  it("names the guns, the hits and where each landed", () => {
    expect(volleyLine({ shooterId: "0", guns: 6, hits: 4, locations: at(2, 1, 1) }, [])).toEqual({ fired: "fired 6 guns", hits: "4 hits: 2 hull, 1 masts, 1 crew" });
    expect(volleyLine({ shooterId: "1", guns: 1, hits: 1, locations: at(0, 0, 1) }, [])).toEqual({ fired: "fired 1 gun", hits: "1 hit: 1 crew" });
    expect(volleyLine({ shooterId: "1", guns: 3, hits: 0, locations: at(0, 0, 0) }, [])).toEqual({ fired: "fired 3 guns", hits: "no hits" });
  });

  it("says when chain or grape shot added to a location a hit landed on, and only then", () => {
    const both = ["chain_shot", "grape_shot"];
    expect(volleyLine({ shooterId: "0", guns: 4, hits: 2, locations: at(1, 1, 0) }, both).hits).toBe("2 hits: 1 hull, 1 masts +1 chain shot");
    expect(volleyLine({ shooterId: "0", guns: 4, hits: 2, locations: at(0, 1, 1) }, both).hits).toBe("2 hits: 1 masts, 1 crew +1 chain shot +1 grape shot");
    expect(volleyLine({ shooterId: "0", guns: 4, hits: 2, locations: at(2, 0, 0) }, both).hits).toBe("2 hits: 2 hull");
  });

  it("reads a volley stored before #380 as every hit on its aim", () => {
    expect(volleyLine({ shooterId: "0", guns: 3, aim: "masts", hits: 2 }, []).hits).toBe("2 hits: 2 masts");
    expect(volleyLine({ shooterId: "0", guns: 2, hits: 1 }, []).hits).toBe("1 hit: 1 hull");
  });
});

describe("answerLine: the line over the answer's Fire!", () => {
  it("names who answers the broadside", () => {
    expect(answerLine("Player 2")).toBe("Player 2 answers the broadside");
  });
});

describe("roundShown: the settled round the panel still shows (#380)", () => {
  const settled = (extra: Partial<SettledRound> = {}): SettledRound => ({
    attackerId: "0",
    defenderId: "1",
    isNPCCombat: false,
    round: 1,
    volleys: [{ shooterId: "0", guns: 2, hits: 1, locations: { hull: 1, masts: 0, crew: 0 } }],
    fleeOutcome: null,
    fleeRolls: null,
    ended: false,
    ...extra,
  });

  it("the round before this one, until this round fires its first volley", () => {
    for (const stage of ["seamanship", "defenderSeamanship", "chooseAction", "fleeAttempt", "cannons"] as const) {
      expect(roundShown(fight({ round: 2, stage }), settled())).toEqual(settled());
    }
    expect(roundShown(fight({ round: 2, stage: "returnFire", volleys: [settled().volleys[0]] }), settled())).toBeNull();
  });

  it("nothing from another fight, another round, or none at all", () => {
    expect(roundShown(fight({ round: 2, stage: "seamanship" }), settled({ defenderId: "2" }))).toBeNull();
    expect(roundShown(fight({ round: 3, stage: "seamanship" }), settled())).toBeNull();
    expect(roundShown(fight({ round: 2, stage: "seamanship" }), undefined)).toBeNull();
  });
});

describe("fightOverLines: how the fight ended, under its last round (#380)", () => {
  const name = (id: string) => (id === "foe" ? "The merchant" : `Player ${Number(id) + 1}`);
  const end = (extra: Partial<SettledRound>): SettledRound => ({
    attackerId: "0",
    defenderId: "1",
    isNPCCombat: false,
    round: 2,
    volleys: [],
    fleeOutcome: null,
    fleeRolls: null,
    ended: true,
    ...extra,
  });
  const afloat = { ships: { "0": {}, "1": {} }, npcs: {} } as unknown as Pick<CaribbeanState, "ships" | "npcs">;

  it("names a ship sunk, and a ship left derelict", () => {
    expect(fightOverLines({ ships: { "0": {} }, npcs: {} } as unknown as Pick<CaribbeanState, "ships" | "npcs">, end({}), name)).toEqual(["Player 2 is sunk"]);
    expect(fightOverLines({ ships: { "0": {}, "1": { isDerelict: true } }, npcs: {} } as unknown as Pick<CaribbeanState, "ships" | "npcs">, end({}), name)).toEqual(["Player 2 is left derelict"]);
    expect(fightOverLines({ ships: { "0": {} }, npcs: {} } as unknown as Pick<CaribbeanState, "ships" | "npcs">, end({ isNPCCombat: true, defenderId: "foe" }), name)).toEqual(["The merchant is sunk"]);
  });

  it("a caught flight: the parting shot ends the chase, or none was fired, out of range", () => {
    expect(fightOverLines(afloat, end({ fleeOutcome: "caught", volleys: [{ shooterId: "0", guns: 2, hits: 0 }] }), name)).toEqual(["The parting shot ends the chase"]);
    expect(fightOverLines(afloat, end({ fleeOutcome: "caught" }), name)).toEqual(["Caught, but out of the pursuer's range: no parting shot"]);
  });
});

describe("pursuitRollsLine: the flight's dice, and the masts that slowed the fleeing ship (#348)", () => {
  it("shows the raw dice when the masts are sound", () => {
    expect(pursuitRollsLine({ pursuer: 4, fleeer: 3 }, 0)).toBe("Pursuit rolls: Pursuer 4 | Fleeer 3");
  });

  it("takes the mast penalty off the fleeing ship's die, up to the cap", () => {
    expect(pursuitRollsLine({ pursuer: 4, fleeer: 3 }, 1)).toBe("Pursuit rolls: Pursuer 4 | Fleeer 3 − 1 masts = 2");
    expect(pursuitRollsLine({ pursuer: 4, fleeer: 3 }, 5)).toBe("Pursuit rolls: Pursuer 4 | Fleeer 3 − 2 masts = 1");
  });
});
