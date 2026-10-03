import type { Hex, MapWrap } from "./hex";
import type { Terrain } from "./terrain";
import type { MapSizeId } from "./mapConfig";

export const WIN_SCORE = 10;
export const GOLD_PER_GLORY = 10;

// Elevation levels for terrain height
// 0 = Water, 1 = Beach, 2 = Jungle, 3 = Mountain
export const ELEVATIONS = [0, 1, 2, 3] as const;
export type Elevation = (typeof ELEVATIONS)[number];

// Biome types for land hexes
export const BIOMES = ["SAND", "GRASS", "ROCK"] as const;
export type Biome = (typeof BIOMES)[number];

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
  shallowDraft: boolean;
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
  inDemandGood: GoodType | null; // The good with highest demand - sell 3+ for Glory
}

export interface ShipState {
  position: Hex;
  cargo: Record<GoodType, number>;
  gold: number;
  maxCargo: number;
  captain?: Captain;
  homePortHex?: Hex; // The port hex (island) - for display/scoring
  homeDockingHex?: Hex; // The docking hex (water) - where ship sits when "at home"
  shipClass?: ShipClass;
  stats?: ShipStats;
  upgrades: string[];
  damage: DamageState;
  isDerelict?: boolean;
  bounties: Record<Nation, number>;
  score: number;
  stashedGold: number;
  scoutedShips: string[]; // IDs of ships this player has scouted
  activeMission?: Mission; // Current active mission from tavern
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

// Mission system types
export const MISSION_TYPES = ["DELIVERY", "ASSASSINATION", "ESCORT"] as const;
export type MissionType = (typeof MISSION_TYPES)[number];

export type MissionStatus = "ACTIVE" | "COMPLETED" | "FAILED";

export interface MissionReward {
  gold: number;
  glory: number;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  type: MissionType;
  targetPortName?: string; // For DELIVERY and ESCORT missions
  targetNpcId?: string; // For ASSASSINATION missions
  reward: MissionReward;
  status: MissionStatus;
  // For ESCORT missions: track if player took damage
  noDamageTaken?: boolean;
}

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

export type DecorationType = "tree" | "rock" | "fort" | "pier";

export interface Decoration {
  type: DecorationType;
  position: [number, number, number];
  rotation: number;
  scale?: number;
}

export interface MapCell {
  hex: Hex;
  terrain: Terrain;
  hasPort: boolean;
  market?: PortMarket;
  nation?: PortNation;
  portName?: string;
  hasShipyard?: boolean;
  decorations?: Decoration[];
  dockingHex?: Hex; // Water hex where ships dock to access this port
  elevation: Elevation; // 0=Water, 1=Beach, 2=Jungle, 3=Mountain
  biome?: Biome; // Only for land hexes: SAND, GRASS, or ROCK
}

export interface CaribbeanState {
  cells: MapCell[];
  ships: Record<string, ShipState>;
  npcs: Record<string, NPCShip>;
  mapSize: MapSizeId;
  /**
   * East–west wrap of the map, or null if it does not wrap. All hex positions in
   * state are kept canonical (column in [0, columns)) under this wrap.
   */
  wrap: MapWrap;
  captainDeck: Captain[];
  draftHands: Record<string, Captain[]>;
  combat?: CombatState;
  floatingLoot: FloatingLoot[];
  npcIdCounter: number;
}
