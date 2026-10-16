import { describe, expect, it } from "vitest";
import { aimedAt, pendingVolley } from "./volleyAim";
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
    expect(pendingVolley(fight({}))).toEqual({ shooterId: "0", aimedBy: "seat", answer: false });
    expect(pendingVolley(fight({ stage: "returnFire" }))).toEqual({ shooterId: "1", aimedBy: "seat", answer: true });
  });

  it("from round 2 the draw's winner aims first, and the pursuer aims a parting shot", () => {
    expect(pendingVolley(fight({ round: 2, seamanshipWinner: "1" }))).toEqual({ shooterId: "1", aimedBy: "seat", answer: false });
    expect(pendingVolley(fight({ round: 2, seamanshipWinner: "1", stage: "returnFire" }))).toEqual({ shooterId: "0", aimedBy: "seat", answer: true });
    expect(pendingVolley(fight({ round: 2, seamanshipWinner: "1", fleeOutcome: "caught" }))).toEqual({ shooterId: "0", aimedBy: "seat", answer: false });
  });

  it("an NPC's volley is aimed by the engine; the player's answer to it by the player", () => {
    const npc = { defenderId: "foe", isNPCCombat: true, round: 2, seamanshipWinner: "foe" };
    expect(pendingVolley(fight(npc))).toEqual({ shooterId: "foe", aimedBy: "engine", answer: false });
    expect(pendingVolley(fight({ ...npc, stage: "returnFire" }))).toEqual({ shooterId: "0", aimedBy: "seat", answer: true });
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
