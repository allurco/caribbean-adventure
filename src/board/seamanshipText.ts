/**
 * The combat panel's lines for the draw (#347), pure: who rolls first, that
 * ties go to the defender, and the attacker's total the defender must match.
 * Seats count from 1 on the board (#110).
 */
import type { CombatState } from "../game/types";

type DrawFight = Pick<CombatState, "attackerId" | "defenderId" | "isNPCCombat" | "seamanshipRolls">;

/** The attacker's die of the draw, its ship's manoeuvrability and their sum. */
export interface DrawTotal {
  die: number;
  maneuverability: number;
  total: number;
}

const seatLabel = (id: string) => Number(id) + 1;

/** The line over the draw's first roll. */
export function drawIntro(combat: DrawFight): string {
  if (combat.isNPCCombat) return "Roll for seamanship to determine who acts first. Ties go to the defender.";
  return `Player ${seatLabel(combat.attackerId)} rolls first, then Player ${seatLabel(combat.defenderId)}. Ties go to the defender.`;
}

/** The attacker's total in the draw, once it has rolled (null before): its die plus its ship's manoeuvrability (none without stats). */
export function attackerDrawTotal(combat: DrawFight, attackerStats: { maneuverability: number } | undefined): DrawTotal | null {
  const die = combat.seamanshipRolls[combat.attackerId];
  if (die === undefined) return null;
  const maneuverability = attackerStats?.maneuverability ?? 0;
  return { die, maneuverability, total: die + maneuverability };
}

/** The line over the defender's roll: the attacker's total, and the total that wins it the draw. */
export function defenderRollLine(combat: DrawFight, attackerStats: { maneuverability: number } | undefined): string {
  const drawn = attackerDrawTotal(combat, attackerStats);
  const attacker = `Player ${seatLabel(combat.attackerId)}`;
  const defender = `Player ${seatLabel(combat.defenderId)}`;
  if (!drawn) return `${defender}, roll for seamanship. Ties go to the defender.`;
  return (
    `${attacker} rolled ${drawn.die} + ${drawn.maneuverability} manoeuvrability = ${drawn.total}. ` +
    `${defender}, roll for seamanship: a total of ${drawn.total} or more wins, as ties go to the defender.`
  );
}
