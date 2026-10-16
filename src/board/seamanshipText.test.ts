import { describe, expect, it } from "vitest";
import { attackerDrawTotal, drawIntro, defenderRollLine } from "./seamanshipText";

const pvp = { attackerId: "0", defenderId: "1", isNPCCombat: false, seamanshipRolls: {} as Record<string, number> };

describe("the draw's lines on the combat panel (#347)", () => {
  it("says who rolls first and that ties go to the defender, in PvP", () => {
    expect(drawIntro(pvp)).toBe("Player 1 rolls first, then Player 2. Ties go to the defender.");
  });

  it("says ties go to the defender against an NPC too", () => {
    expect(drawIntro({ ...pvp, defenderId: "npc-1", isNPCCombat: true })).toBe(
      "Roll for seamanship to determine who acts first. Ties go to the defender.",
    );
  });

  it("gives the attacker's total, its die plus its ship's manoeuvrability, once it has rolled", () => {
    expect(attackerDrawTotal({ ...pvp, seamanshipRolls: { "0": 4 } }, { maneuverability: 3 })).toEqual({ die: 4, maneuverability: 3, total: 7 });
    expect(attackerDrawTotal(pvp, { maneuverability: 3 })).toBeNull();
    // A ship with no stats sails with no manoeuvrability
    expect(attackerDrawTotal({ ...pvp, seamanshipRolls: { "0": 5 } }, undefined)).toEqual({ die: 5, maneuverability: 0, total: 5 });
  });

  it("tells the defender the total it must match, ties being its own", () => {
    expect(defenderRollLine({ ...pvp, attackerId: "2", seamanshipRolls: { "2": 4 } }, { maneuverability: 3 })).toBe(
      "Player 3 rolled 4 + 3 manoeuvrability = 7. Player 2, roll for seamanship: a total of 7 or more wins, as ties go to the defender.",
    );
  });
});
