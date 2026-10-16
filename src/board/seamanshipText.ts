/**
 * The combat panel's lines for the draw (#347), pure: who rolls first, that
 * ties go to the defender, and the attacker's total the defender must match.
 * Captains are named as the waiting lines name them (`seatName`).
 */
import type { CaribbeanState, CombatState } from "../game/types";
import { seatName } from "./seat";

type DrawFight = Pick<CombatState, "attackerId" | "defenderId" | "isNPCCombat" | "seamanshipRolls">;
type Ships = Pick<CaribbeanState, "ships">;

/** The attacker's die of the draw, its ship's maneuverability and their sum. */
export interface DrawTotal {
  die: number;
  maneuverability: number;
  total: number;
}

/** The line over the draw's first roll. */
export function drawIntro(G: Ships, combat: DrawFight): string {
  if (combat.isNPCCombat) return "Roll for seamanship to determine who acts first. Ties go to the defender.";
  return `${seatName(G, combat.attackerId)} rolls first, then ${seatName(G, combat.defenderId)}. Ties go to the defender.`;
}

/** The attacker's total in the draw, once it has rolled (null before): its die plus its ship's maneuverability (none without stats). */
export function attackerDrawTotal(G: Ships, combat: DrawFight): DrawTotal | null {
  const die = combat.seamanshipRolls[combat.attackerId];
  if (die === undefined) return null;
  const maneuverability = G.ships[combat.attackerId]?.stats?.maneuverability ?? 0;
  return { die, maneuverability, total: die + maneuverability };
}

/** The line over the defender's roll: the attacker's total, and the total that wins it the draw. */
export function defenderRollLine(G: Ships, combat: DrawFight): string {
  const drawn = attackerDrawTotal(G, combat);
  const defender = seatName(G, combat.defenderId);
  if (!drawn) return `${defender}, roll for seamanship. Ties go to the defender.`;
  return (
    `${seatName(G, combat.attackerId)} rolled ${drawn.die} + ${drawn.maneuverability} Maneuverability = ${drawn.total}. ` +
    `${defender}, roll for seamanship: a total of ${drawn.total} or more wins, as ties go to the defender.`
  );
}
