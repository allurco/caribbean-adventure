import { describe, expect, it } from "vitest";
import type { CaribbeanState, ShipState } from "../game/types";
import { attackerDrawTotal, drawIntro, defenderRollLine } from "./seamanshipText";

const pvp = { attackerId: "0", defenderId: "1", isNPCCombat: false, seamanshipRolls: {} as Record<string, number> };

/** Seats by captain name (none for a seat with no captain yet) and the attacker's manoeuvrability. */
function table(maneuverability: number | null, captains: Record<string, string | null> = { "0": "Anne Bonny", "1": "Calico Jack" }): Pick<CaribbeanState, "ships"> {
  const ships = Object.fromEntries(
    Object.entries(captains).map(([seat, name]) => [
      seat,
      {
        captain: name ? { id: seat, name, nation: "Spain", ability: "-" } : undefined,
        stats: maneuverability === null ? undefined : { maneuverability },
      } as unknown as ShipState,
    ]),
  );
  return { ships };
}

describe("the draw's lines on the combat panel (#347)", () => {
  it("says which captain rolls first and that ties go to the defender, in PvP", () => {
    expect(drawIntro(table(2), pvp)).toBe("Anne Bonny rolls first, then Calico Jack. Ties go to the defender.");
  });

  it("names a seat with no captain by its number, as the waiting lines do", () => {
    expect(drawIntro(table(2, { "0": "Anne Bonny", "1": null }), pvp)).toBe("Anne Bonny rolls first, then Player 2. Ties go to the defender.");
  });

  it("says ties go to the defender against an NPC too", () => {
    expect(drawIntro(table(2), { ...pvp, defenderId: "npc-1", isNPCCombat: true })).toBe(
      "Roll for seamanship to determine who acts first. Ties go to the defender.",
    );
  });

  it("gives the attacker's total, its die plus its ship's maneuverability, once it has rolled", () => {
    expect(attackerDrawTotal(table(3), { ...pvp, seamanshipRolls: { "0": 4 } })).toEqual({ die: 4, maneuverability: 3, total: 7 });
    expect(attackerDrawTotal(table(3), pvp)).toBeNull();
    // A ship with no stats sails with no maneuverability
    expect(attackerDrawTotal(table(null), { ...pvp, seamanshipRolls: { "0": 5 } })).toEqual({ die: 5, maneuverability: 0, total: 5 });
  });

  it("tells the defender the total it must match, ties being its own", () => {
    expect(defenderRollLine(table(3), { ...pvp, seamanshipRolls: { "0": 4 } })).toBe(
      "Anne Bonny rolled 4 + 3 Maneuverability = 7. Calico Jack, roll for seamanship: a total of 7 or more wins, as ties go to the defender.",
    );
  });
});
