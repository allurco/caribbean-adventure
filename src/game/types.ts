import type { Hex } from "./hex";
import type { Terrain } from "./terrain";
import type { MapSizeId } from "./mapConfig";

export const WIN_SCORE = 10;
export const GOLD_PER_GLORY = 10;

export const GOOD_TYPES = ["Wood", "Sugar", "Rum", "Spice"] as const;
export type GoodType = (typeof GOOD_TYPES)[number];

export const NATIONS = ["England", "France", "Spain", "Netherlands"] as const;
export type Nation = (typeof NATIONS)[number];

// Port nations include regular nations plus "Pirate" havens
export const PORT_NATIONS = ["England", "France", "Spain", "Netherlands", "Pirate"] as const;
export type PortNation = (typeof PORT_NATIONS)[number];

export interface Captain {
  id: string;
  name: string;
  nation: Nation;
  ability: string;
}

export const SHIP_CLASSES = ["Sloop", "Flute", "Frigate", "Galleon"] as const;
export type ShipClass = (typeof SHIP_CLASSES)[number];

export const STARTER_SHIP_CLASSES: readonly ShipClass[] = ["Sloop", "Flute"];

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
  isDerelict?: boolean;
  bounties: Record<Nation, number>;
  score: number;
  stashedGold: number;
  scoutedShips: string[]; // IDs of ships this player has scouted
}

export type CombatAction = "fire" | "board" | "flee";
export type CombatStage = "seamanship" | "chooseAction" | "fleeAttempt" | "cannons" | "resolution";
export type FleeOutcome = "escaped" | "caught" | null;

export interface CombatState {
  attackerId: string;
  defenderId: string;
  round: number;
  stage: CombatStage;
  seamanshipWinner: string | null;
  seamanshipRolls: Record<string, number>;
  actionChosen: CombatAction | null;
  attackerHits: number;
  defenderHits: number;
  distance: number;
  isNPCCombat: boolean;
  fleeOutcome: FleeOutcome;
  fleeRolls: { pursuer: number; fleeer: number } | null;
}

export interface FloatingLoot {
  id: string;
  hex: Hex;
  cargo: Record<GoodType, number>;
  gold: number;
}

export type AIBehavior = "MERCHANT_ROUTE" | "HUNTER";
export type NPCRole = "MERCHANT" | "FLOTILLA";

export interface NPCShip {
  id: string;
  position: Hex;
  cargo: Record<GoodType, number>;
  gold: number;
  shipClass: ShipClass;
  stats: ShipStats;
  damage: DamageState;
  nation: Nation;
  aiBehavior: AIBehavior;
  destinationPortHex: Hex;
  spawnPortHex: Hex;
  isIdentified: boolean;
  bounty: number;
  isDerelict?: boolean;
  role: NPCRole;
  huntingTargetId: string | null;
}

export interface MapCell {
  hex: Hex;
  terrain: Terrain;
  hasPort: boolean;
  market?: PortMarket;
  nation?: PortNation;
  portName?: string;
  hasShipyard?: boolean;
}

export interface CaribbeanState {
  cells: MapCell[];
  ships: Record<string, ShipState>;
  npcs: Record<string, NPCShip>;
  mapSize: MapSizeId;
  captainDeck: Captain[];
  draftHands: Record<string, Captain[]>;
  combat?: CombatState;
  floatingLoot: FloatingLoot[];
  npcIdCounter: number;
}
