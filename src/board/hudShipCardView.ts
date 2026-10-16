/**
 * What the HUD's ship card shows, shaped from a `ShipState`: the meters, the
 * damage and bounty lines, the stat grid, the hold and the contract taken at a
 * tavern. Pure, no React, so `HudShipCard` only lays it out.
 */
import type { GoodType, Nation, ShipState } from "../game/types";
import { GOOD_TYPES } from "../game/types";
import { UPGRADES } from "../game/constants";
import { totalCargo } from "../game/economy";
import { getWantedNations } from "../game/reputation";

export interface ShipMeter {
  label: string;
  current: number;
  max: number;
  /** Filled share of the bar, 0–100, clamped. */
  percent: number;
}

export interface ShipCardView {
  title: string;
  meters: ShipMeter[];
  damage: { label: string; amount: number }[];
  wanted: { nation: Nation; bounty: number }[];
  stats: { label: string; value: string }[];
  cargo: { good: GoodType; amount: number }[];
  upgrades: string[];
  /** The title of the contract the captain took at a tavern, or null. */
  contract: string | null;
}

/** Filled share of a `current / max` bar, 0–100; an empty bar when `max` is not positive. */
export function meterPercent(current: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(100, Math.max(0, (current / max) * 100));
}

const meter = (label: string, current: number, max: number): ShipMeter => ({
  label,
  current,
  max,
  percent: meterPercent(current, max),
});

export function shipCardView(ship: ShipState): ShipCardView {
  const { stats } = ship;
  const damage = (["hull", "crew", "masts"] as const)
    .filter((part) => ship.damage[part] > 0)
    .map((part) => ({ label: part[0].toUpperCase() + part.slice(1), amount: ship.damage[part] }));
  return {
    title: ship.shipClass ?? "Ship",
    meters: stats
      ? [meter("Hull", stats.hull.current, stats.hull.max), meter("Crew", stats.crew.current, stats.crew.max)]
      : [],
    damage,
    wanted: getWantedNations(ship.bounties).map((nation) => ({ nation, bounty: ship.bounties[nation] })),
    stats: stats
      ? [
          { label: "Cannons", value: String(stats.cannons) },
          { label: "Scouting", value: String(stats.scouting) },
          { label: "Moves", value: String(stats.maneuverability) },
          { label: "Cargo", value: `${totalCargo(ship.cargo)}/${ship.maxCargo}` },
        ]
      : [],
    cargo: GOOD_TYPES.filter((good) => ship.cargo[good] > 0).map((good) => ({ good, amount: ship.cargo[good] })),
    upgrades: ship.upgrades.map((id) => UPGRADES[id]?.name ?? id),
    contract: ship.activeMission?.title ?? null,
  };
}
