import type { CaribbeanState } from "../game/types";
import { holdsGauge } from "../game/weatherGauge";
import type { Wind } from "../game/wind";
import { defenderName, seatName, type FightSides } from "./seat";

/**
 * The combat panel's weather-gauge line (#264): who holds it, by the name the
 * board gives each side, or that neither does. Null when a side is missing.
 * The gauge has no rules effect yet; this only shows it.
 */
export function gaugeLine(
  G: Pick<CaribbeanState, "ships" | "npcs" | "wrap">,
  combat: FightSides,
  wind: Wind
): string | null {
  const attacker = G.ships[combat.attackerId];
  const defender = combat.isNPCCombat ? G.npcs[combat.defenderId] : G.ships[combat.defenderId];
  if (!attacker || !defender) return null;
  const holder = holdsGauge(
    { id: combat.attackerId, position: attacker.position },
    { id: combat.defenderId, position: defender.position },
    wind,
    G.wrap
  );
  if (holder === null) return "Weather gauge: neither, square to the wind";
  const name = holder === combat.attackerId ? seatName(G, combat.attackerId) : defenderName(G, combat);
  return `Weather gauge: ${name}`;
}
