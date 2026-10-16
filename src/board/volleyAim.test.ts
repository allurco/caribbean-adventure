import { describe, expect, it } from "vitest";
import { aimedAt, answerLine, pendingVolley, pursuitRollsLine, volleyLine } from "./volleyAim";
import type { CombatState } from "../game/types";

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

describe("pendingVolley: the volley the fight waits on, and who aims it (#348)", () => {
  it("the ambush is the attacker's to aim, and the answer the defender's", () => {
    expect(pendingVolley(fight({}))).toEqual({ shooterId: "0", aimedBy: "seat" });
    expect(pendingVolley(fight({ stage: "returnFire" }))).toEqual({ shooterId: "1", aimedBy: "seat" });
  });

  it("from round 2 the draw's winner aims first, and the pursuer aims a parting shot", () => {
    expect(pendingVolley(fight({ round: 2, seamanshipWinner: "1" }))).toEqual({ shooterId: "1", aimedBy: "seat" });
    expect(pendingVolley(fight({ round: 2, seamanshipWinner: "1", stage: "returnFire" }))).toEqual({ shooterId: "0", aimedBy: "seat" });
    expect(pendingVolley(fight({ round: 2, seamanshipWinner: "1", fleeOutcome: "caught" }))).toEqual({ shooterId: "0", aimedBy: "seat" });
  });

  it("an NPC's volley is aimed by the engine; the player's answer to it by the player", () => {
    const npc = { defenderId: "foe", isNPCCombat: true, round: 2, seamanshipWinner: "foe" };
    expect(pendingVolley(fight(npc))).toEqual({ shooterId: "foe", aimedBy: "engine" });
    expect(pendingVolley(fight({ ...npc, stage: "returnFire" }))).toEqual({ shooterId: "0", aimedBy: "seat" });
  });

  it("is nothing at any other step", () => {
    for (const stage of ["seamanship", "defenderSeamanship", "chooseAction", "fleeAttempt", "resolution"] as const) {
      expect(pendingVolley(fight({ stage }))).toBeNull();
    }
  });
});

describe("aimedAt: where a volley went, in words", () => {
  it("names the aim, and the hull for a volley fired before aiming", () => {
    expect(aimedAt("masts")).toBe("at the masts");
    expect(aimedAt("crew")).toBe("at the crew");
    expect(aimedAt("hull")).toBe("at the hull");
    expect(aimedAt(undefined)).toBe("at the hull");
  });
});

describe("volleyLine: a fired volley, in words", () => {
  it("names the guns, the aim and the hits", () => {
    expect(volleyLine({ shooterId: "0", guns: 3, aim: "masts", hits: 2 }, [])).toEqual({ fired: "fired 3 guns at the masts", hits: "2 hits" });
    expect(volleyLine({ shooterId: "1", guns: 1, aim: "crew", hits: 1 }, [])).toEqual({ fired: "fired 1 gun at the crew", hits: "1 hit" });
  });

  it("says when chain or grape shot added its hit, and only then", () => {
    const both = ["chain_shot", "grape_shot"];
    expect(volleyLine({ shooterId: "0", guns: 4, aim: "masts", hits: 2 }, both).hits).toBe("2 hits +1 chain shot");
    expect(volleyLine({ shooterId: "0", guns: 4, aim: "crew", hits: 1 }, both).hits).toBe("1 hit +1 grape shot");
    expect(volleyLine({ shooterId: "0", guns: 4, aim: "hull", hits: 2 }, both).hits).toBe("2 hits");
    expect(volleyLine({ shooterId: "0", guns: 4, aim: "masts", hits: 0 }, both).hits).toBe("0 hits");
  });

  it("reads a volley fired before aiming as fired at the hull", () => {
    expect(volleyLine({ shooterId: "0", guns: 2, hits: 0 }, [])).toEqual({ fired: "fired 2 guns at the hull", hits: "0 hits" });
  });
});

describe("answerLine: the line over the answer's aim", () => {
  it("names who answers the broadside", () => {
    expect(answerLine("Player 2")).toBe("Player 2 answers the broadside");
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
