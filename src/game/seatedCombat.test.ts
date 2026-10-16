import { describe, expect, it } from "vitest";
import { INVALID_MOVE } from "boardgame.io/core";
import type { Move } from "boardgame.io";
import { Caribbean } from "./Game";
import { withSeatedCombat } from "./seatedCombat";
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
    for (const name of ["rollFleeAttempt", "rollCannons", "applyResolution"]) {
      expect(press(name, "0", { ...fight("1"), stage: "cannons" }), name).toBe(INVALID_MOVE);
    }
  });

  it("refuses the parting shot, and its damage, from the ship caught fleeing: its pursuer fires it", () => {
    for (const fled of ["0", "1"]) {
      for (const [name, stage] of [["rollCannons", "cannons"], ["applyResolution", "resolution"]] as const) {
        const caught = { ...fight(fled), stage, fleeOutcome: "caught" as const };
        expect(press(name, fled, caught), `${name} by ${fled}`).toBe(INVALID_MOVE);
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
