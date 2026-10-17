import { describe, expect, it } from "vitest";
import { INVALID_MOVE } from "boardgame.io/core";
import type { Move } from "boardgame.io";
import { Caribbean } from "./Game";
import { withSeatedCombat } from "./seatedCombat";
import { seatMayActInCombat, type FightStep } from "./combatActor";
import type { CaribbeanState, CombatState } from "./types";

const fight = (seamanshipWinner: string): Partial<CombatState> => ({
  attackerId: "0",
  defenderId: "1",
  isNPCCombat: false,
  stage: "chooseAction",
  seamanshipWinner,
});

function press(name: string, playerID: string | undefined, combat: Partial<CombatState>): unknown {
  const move = withSeatedCombat(Caribbean).phases!.combat.moves![name] as Move<CaribbeanState>;
  const run = typeof move === "function" ? move : move.move;
  // A refused move returns before it reads anything else of the context.
  return run({ G: { combat } as CaribbeanState, playerID } as Parameters<typeof run>[0], "fire");
}

describe("withSeatedCombat (#113 review)", () => {
  it("refuses a combat step from any seat but the one that presses it", () => {
    expect(press("chooseCombatAction", "0", fight("1"))).toBe(INVALID_MOVE);
    expect(press("chooseCombatAction", "1", fight("0"))).toBe(INVALID_MOVE);
    expect(press("rollSeamanship", "1", { ...fight("1"), stage: "seamanship" })).toBe(INVALID_MOVE);
    // Each captain rolls its own die of the draw (#347): the attacker may not roll the defender's
    expect(press("rollDefenderSeamanship", "0", { ...fight("1"), stage: "defenderSeamanship", seamanshipWinner: null })).toBe(INVALID_MOVE);
    for (const name of ["rollFleeAttempt", "rollCannons"]) {
      expect(press(name, "0", { ...fight("1"), stage: "cannons" }), name).toBe(INVALID_MOVE);
    }
  });

  it("refuses the answer from the ship that fired first (#348)", () => {
    // Round 1: the attacker fired the ambush; the defender answers
    expect(press("returnFire", "0", { ...fight("0"), seamanshipWinner: null, round: 1, stage: "returnFire" })).toBe(INVALID_MOVE);
    // From round 2 the defender won the draw and fired first; the attacker answers
    expect(press("returnFire", "1", { ...fight("1"), round: 2, stage: "returnFire" })).toBe(INVALID_MOVE);
  });

  it("refuses the parting shot from the ship caught fleeing: its pursuer fires it", () => {
    for (const fled of ["0", "1"]) {
      const caught = { ...fight(fled), stage: "cannons" as const, fleeOutcome: "caught" as const };
      expect(press("rollCannons", fled, caught), `rollCannons by ${fled}`).toBe(INVALID_MOVE);
    }
  });

  it("the legacy resolution (a fight stored before #380) may be pressed by either captain of the fight, and no bystander", () => {
    for (const winner of ["0", "1"]) {
      for (const fleeOutcome of [null, "caught"] as const) {
        const stored = { ...fight(winner), stage: "resolution" as const, fleeOutcome };
        for (const seat of ["0", "1"]) expect(seatMayActInCombat({ playerID: seat, combat: stored as FightStep }), `${seat} after ${winner}`).toBe(true);
        expect(press("applyResolution", "2", stored)).toBe(INVALID_MOVE);
        expect(seatMayActInCombat({ playerID: "2", combat: stored as FightStep })).toBe(false);
      }
    }
  });

  it("wraps every combat move and leaves the hotseat game's moves untouched", () => {
    const seated = withSeatedCombat(Caribbean);
    expect(Object.keys(seated.phases!.combat.moves!)).toEqual(Object.keys(Caribbean.phases!.combat.moves!));
    for (const name of Object.keys(Caribbean.phases!.combat.moves!)) {
      expect(seated.phases!.combat.moves![name]).not.toBe(Caribbean.phases!.combat.moves![name]);
    }
    expect(seated.phases!.main).toBe(Caribbean.phases!.main);
    expect(seated.moves).toBe(Caribbean.moves);
  });
});
