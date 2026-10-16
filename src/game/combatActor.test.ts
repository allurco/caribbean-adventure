import { describe, expect, it } from "vitest";
import { combatActor, type FightTurn } from "./combatActor";
import type { CombatStage } from "./types";

/** Seat 0 attacks seat 1 (or an NPC); `winner` won the draw. */
const fight = (stage: CombatStage, winner: string | null, extra: Partial<FightTurn> = {}): FightTurn => ({
  stage,
  attackerId: "0",
  defenderId: "1",
  seamanshipWinner: winner,
  isNPCCombat: false,
  fleeOutcome: null,
  ...extra,
});

describe("combatActor: the seat that presses a fight's step", () => {
  it("round 1, the ambush (#346): with no draw rolled, the attacker fires the opening broadside and ends the round", () => {
    for (const stage of ["cannons", "resolution"] as const) {
      expect(combatActor(fight(stage, null))).toBe("0");
      expect(combatActor(fight(stage, null, { defenderId: "npc-1", isNPCCombat: true }))).toBe("0");
      // The voyage list sends no NPC's id: the defender may be null
      expect(combatActor(fight(stage, null, { defenderId: null, isNPCCombat: true }))).toBe("0");
    }
  });

  it("from round 2 each captain rolls its own die of the draw (#347): the attacker first, then the defender", () => {
    expect(combatActor(fight("seamanship", null))).toBe("0");
    expect(combatActor(fight("defenderSeamanship", null))).toBe("1");
    expect(combatActor(fight("defenderSeamanship", null, { attackerId: "2", defenderId: "0" }))).toBe("0");
  });

  it("against an NPC the attacker rolls the draw, the NPC's die with its own (#347)", () => {
    expect(combatActor(fight("seamanship", null, { defenderId: "npc-1", isNPCCombat: true }))).toBe("0");
    // A fight never waits on an NPC's die; were one to, the attacker would press it
    expect(combatActor(fight("defenderSeamanship", null, { defenderId: "npc-1", isNPCCombat: true }))).toBe("0");
    expect(combatActor(fight("defenderSeamanship", null, { defenderId: null, isNPCCombat: true }))).toBe("0");
  });

  it("the draw's winner chooses, and presses its own flight and an exchange of fire", () => {
    for (const winner of ["0", "1"]) {
      for (const stage of ["chooseAction", "fleeAttempt", "cannons", "resolution"] as const) {
        expect(combatActor(fight(stage, winner))).toBe(winner);
      }
    }
  });

  it("a ship caught fleeing does not fire the parting shot at itself: the pursuer fires it and applies its damage", () => {
    // The attacker won the draw, fled and was caught: the defender gives chase
    expect(combatActor(fight("cannons", "0", { fleeOutcome: "caught" }))).toBe("1");
    expect(combatActor(fight("resolution", "0", { fleeOutcome: "caught" }))).toBe("1");
    // The defender won the draw, fled and was caught: the attacker gives chase
    expect(combatActor(fight("cannons", "1", { fleeOutcome: "caught" }))).toBe("0");
    expect(combatActor(fight("resolution", "1", { fleeOutcome: "caught" }))).toBe("0");
  });

  it("against an NPC the attacker presses every step, its flight caught included", () => {
    const npc = { defenderId: "npc-1", isNPCCombat: true };
    expect(combatActor(fight("cannons", "0", { ...npc, fleeOutcome: "caught" }))).toBe("0");
    expect(combatActor(fight("cannons", "npc-1", { ...npc, fleeOutcome: "caught" }))).toBe("0");
    expect(combatActor(fight("resolution", "npc-1", { ...npc, fleeOutcome: "caught" }))).toBe("0");
  });
});
