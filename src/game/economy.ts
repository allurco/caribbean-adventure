import type { Hex } from "./hex";
import type {
  GoodType,
  ShipState,
  PortMarket,
  ShipClass,
  DamageCategory,
} from "./types";
import { GOOD_TYPES } from "./types";
import { SHIP_SPECS, UPGRADES, REPAIR_COST_PER_POINT } from "./constants";

export const PRICE_RANGES: Record<
  GoodType,
  { minBuy: number; maxBuy: number; spread: number }
> = {
  Wood: { minBuy: 5, maxBuy: 10, spread: 2 },
  Sugar: { minBuy: 15, maxBuy: 25, spread: 5 },
  Rum: { minBuy: 25, maxBuy: 40, spread: 7 },
  Spice: { minBuy: 35, maxBuy: 55, spread: 10 },
};

export const STARTING_GOLD = 50;
export const DEFAULT_MAX_CARGO = 3;

export function emptyCargo(): Record<GoodType, number> {
  return { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 };
}

export function totalCargo(cargo: Record<GoodType, number>): number {
  return GOOD_TYPES.reduce((sum, g) => sum + cargo[g], 0);
}

export function hasCargoSpace(ship: ShipState, amount: number): boolean {
  return totalCargo(ship.cargo) + amount <= ship.maxCargo;
}

export function canBuy(
  ship: ShipState,
  good: GoodType,
  amount: number,
  market: PortMarket,
): boolean {
  if (amount <= 0) return false;
  if (!hasCargoSpace(ship, amount)) return false;
  return ship.gold >= market.prices[good].buy * amount;
}

export function canSell(
  ship: ShipState,
  good: GoodType,
  amount: number,
): boolean {
  if (amount <= 0) return false;
  return ship.cargo[good] >= amount;
}

export function createShipState(
  position: Hex,
  shipClass?: ShipClass,
): ShipState {
  const stats = shipClass ? structuredClone(SHIP_SPECS[shipClass]) : undefined;
  return {
    position,
    cargo: emptyCargo(),
    gold: STARTING_GOLD,
    maxCargo: stats ? stats.cargo : DEFAULT_MAX_CARGO,
    shipClass,
    stats,
    upgrades: [],
    damage: { hull: 0, crew: 0, masts: 0 },
  };
}

export function canBuyUpgrade(ship: ShipState, upgradeId: string): boolean {
  const upgrade = UPGRADES[upgradeId];
  if (!upgrade) return false;
  if (ship.upgrades.includes(upgradeId)) return false;
  return ship.gold >= upgrade.cost;
}

export function applyUpgrade(ship: ShipState, upgradeId: string): void {
  const upgrade = UPGRADES[upgradeId];
  ship.gold -= upgrade.cost;
  ship.upgrades.push(upgradeId);

  if (!ship.stats) return;

  const eff = upgrade.effect;
  if (eff.maneuverability) ship.stats.maneuverability += eff.maneuverability;
  if (eff.scouting) ship.stats.scouting += eff.scouting;
  if (eff.cannons) ship.stats.cannons += eff.cannons;
  if (eff.cargo) {
    ship.stats.cargo += eff.cargo;
    ship.maxCargo = ship.stats.cargo;
  }
  if (eff.hullMax) {
    ship.stats.hull.max += eff.hullMax;
  }
  if (eff.crewMax) {
    ship.stats.crew.max += eff.crewMax;
    ship.stats.crew.current += eff.crewMax;
  }
}

export function canRepair(ship: ShipState, category: DamageCategory): boolean {
  if (ship.damage[category] <= 0) return false;
  return ship.gold >= REPAIR_COST_PER_POINT;
}

export function applyRepair(
  ship: ShipState,
  category: DamageCategory,
  points: number,
): void {
  const actual = Math.min(points, ship.damage[category]);
  const cost = actual * REPAIR_COST_PER_POINT;
  ship.gold -= cost;
  ship.damage[category] -= actual;

  if (ship.stats && (category === "hull" || category === "crew")) {
    ship.stats[category].current += actual;
  }
}

export function generatePortMarket(rng: () => number): PortMarket {
  const prices = {} as Record<GoodType, { buy: number; sell: number }>;
  for (const good of GOOD_TYPES) {
    const range = PRICE_RANGES[good];
    const buy =
      range.minBuy + Math.floor(rng() * (range.maxBuy - range.minBuy + 1));
    prices[good] = { buy, sell: buy - range.spread };
  }
  return { prices };
}
