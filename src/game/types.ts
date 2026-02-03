import type { Hex } from "./hex";
import type { Terrain } from "./terrain";
import type { MapSizeId } from "./mapConfig";

export const GOOD_TYPES = ["Wood", "Sugar", "Rum", "Spice"] as const;
export type GoodType = (typeof GOOD_TYPES)[number];

export const NATIONS = ["England", "France", "Spain", "Netherlands"] as const;
export type Nation = (typeof NATIONS)[number];

export interface Captain {
  id: string;
  name: string;
  nation: Nation;
  ability: string;
}

export const SHIP_CLASSES = ["Sloop", "Flute"] as const;
export type ShipClass = (typeof SHIP_CLASSES)[number];

export interface ShipStats {
  maneuverability: number;
  scouting: number;
  cannons: number;
  crew: { current: number; max: number };
  hull: { current: number; max: number };
  cargo: number;
}

export interface DamageState {
  hull: number;
  crew: number;
  masts: number;
}

export type DamageCategory = keyof DamageState;

export interface ShipUpgrade {
  id: string;
  name: string;
  description: string;
  cost: number;
  effect: Partial<{
    maneuverability: number;
    cargo: number;
    cannons: number;
    scouting: number;
    crewMax: number;
    hullMax: number;
  }>;
}

// Re-export SHIP_SPECS from constants for backward compatibility
export { SHIP_SPECS } from "./constants";

export interface PortMarket {
  prices: Record<GoodType, { buy: number; sell: number }>;
}

export interface ShipState {
  position: Hex;
  cargo: Record<GoodType, number>;
  gold: number;
  maxCargo: number;
  captain?: Captain;
  homePortHex?: Hex;
  shipClass?: ShipClass;
  stats?: ShipStats;
  upgrades: string[];
  damage: DamageState;
}

export interface MapCell {
  hex: Hex;
  terrain: Terrain;
  hasPort: boolean;
  market?: PortMarket;
  nation?: Nation;
}

export interface CaribbeanState {
  cells: MapCell[];
  ships: Record<string, ShipState>;
  mapSize: MapSizeId;
  captainDeck: Captain[];
  draftHands: Record<string, Captain[]>;
}
