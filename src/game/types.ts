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

export const DAMAGE_CATEGORIES = ["hull", "crew", "masts"] as const;

export const COMBAT_ACTIONS = ["fire", "board", "flee"] as const;

export const COMBAT_STAGES = ["seamanship", "defenderSeamanship", "chooseAction", "fleeAttempt", "cannons", "returnFire", "resolution"] as const;

/** Where a hit lands (#380): each hit of a volley rolls one, uniformly. */
export const HIT_LOCATIONS = ["hull", "masts", "crew"] as const;

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
  /**
   * Only in a seat's view of the draft (`playerViewFor`, #111): this other
   * seat has picked, its captain and ship hidden until the draft ends. Never
   * in the game's own state.
   */
  draftPicked?: true;
}

export type CombatAction = (typeof COMBAT_ACTIONS)[number];
export type CombatStage = (typeof COMBAT_STAGES)[number];
export type FleeOutcome = "escaped" | "caught" | null;
export type HitLocation = (typeof HIT_LOCATIONS)[number];
/** A volley's hits counted by where they landed (#380). */
export type HitCounts = Record<HitLocation, number>;

/** One broadside fired in a round (#346): who fired, how many guns, how many hit, and where each hit landed (#380). */
export interface Volley {
  shooterId: string;
  guns: number;
  hits: number;
  /**
   * The hits by where each landed (#380). Optional only because a volley
   * stored before #380 (an online match mid-fight as the change deployed)
   * lacks it: read it from `aim` (`hitCountsOf`).
   */
  locations?: HitCounts;
  /**
   * Where every hit went, in a volley stored before #380 (#348's aim). None
   * at all before #348: every hit went to the hull then.
   */
  aim?: HitLocation;
}

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
  /**
   * This round's volleys, in the order they were fired (#346): each one's
   * damage landed before the next was rolled. Empty until the cannons.
   * Optional only because a fight stored before #346 lacks it (a match
   * mid-fight as the change deployed): read it as none.
   */
  volleys?: Volley[];
  distance: number;
  isNPCCombat: boolean;
  fleeOutcome: FleeOutcome;
  fleeRolls: { pursuer: number; fleeer: number } | null;
}

/**
 * The last round a fight settled (#380), kept once it is settled: the round
 * settles itself as its last volley lands, so the board still shows the
 * round's volleys on the next step, the next draw or the end of the fight.
 * Replaced by each round settled, cleared as a new fight opens.
 */
export interface SettledRound {
  attackerId: string;
  defenderId: string;
  isNPCCombat: boolean;
  round: number;
  /** The round's volleys, in the order they were fired. */
  volleys: Volley[];
  fleeOutcome: FleeOutcome;
  fleeRolls: { pursuer: number; fleeer: number } | null;
  /** Whether the fight ended with this round. */
  ended: boolean;
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
  /**
   * The region this hex lies in (#239): an id into `CaribbeanState.regions`.
   * Land, reef and water alike; set on every cell by the generator. Optional
   * only so hand-built cells in tests can leave it out.
   */
  region?: RegionId;
}

/** A region's id: its index in `CaribbeanState.regions`. */
export type RegionId = number;

/**
 * A region (#239): one nation's waters, or the Pirates' (`nation` "Pirate").
 * Its islands were generated as one cluster, every port in it was founded
 * under its flag, and open sea separates it from the others.
 */
export interface Region {
  id: RegionId;
  nation: PortNation;
  /** Its name on the board, e.g. "the Spanish Main". */
  name: string;
  /** The regions whose waters touch this one's, by id, ascending. */
  neighbours: RegionId[];
}

/**
 * What a match may be created with (boardgame.io `setupData`): a map size
 * and a generation seed to pin, each chosen at random when left out.
 */
export interface CaribbeanSetupData {
  mapSize?: MapSizeId;
  mapSeed?: number;
}

/** A kind of event card (#240). Later slices add theirs here and to `EVENT_DECK_MIX` (eventDeck.ts). */
export type EventCardKind = "calmSeas" | "merchantConvoy";

/**
 * What an event card did (#246), public facts only (what happened, where),
 * never a ship's gold or cargo: every seat sees the log (`playerViewFor`
 * passes it through).
 */
export type EventEffect =
  | { kind: "calmSeas" }
  | {
      kind: "merchantConvoy";
      /** The region of the port the convoy sailed from, null on a hand-built map without regions. */
      region: RegionId | null;
      /** The port it sailed from. */
      port: string;
      /** How many merchants put to sea, 1 or 2. */
      merchants: number;
      /** Each merchant's destination port, in the order they sailed. */
      bound: string[];
    };

/** One event drawn (#246), as the event log and the HUD's card show it. */
export type EventLogEntry = {
  /** Its number in the match's draws, from 1: the HUD tells a new card from one it has shown by it. */
  id: number;
  /**
   * The seat whose turn ended when it was drawn. Not read by this slice's
   * HUD; kept so the log can say on whose turn an event came, and for the
   * presentation queue of #248, which stages each event after its turn.
   */
  seat: string;
  /** The boardgame.io turn (`ctx.turn`) that ended. */
  turn: number;
} & EventEffect;

/** The event deck in G (#246). Plain JSON. */
export interface EventDeckState {
  /** The cards still to draw, the top card last. Hidden from every seat (`playerViewFor`), like the undealt captains. */
  drawPile: EventCardKind[];
  /** The last few events drawn (`EVENT_LOG_LENGTH`), oldest first. Public. */
  log: EventLogEntry[];
  /** How many cards the match has drawn: the last entry's `id`. */
  drawn: number;
}

export interface CaribbeanState {
  cells: MapCell[];
  /**
   * The map's regions (#239), indexed by id; each cell names its own. Always
   * set by `setup()`; optional only so hand-built states in tests can leave
   * it out.
   */
  regions?: Region[];
  ships: Record<string, ShipState>;
  npcs: Record<string, NPCShip>;
  mapSize: MapSizeId;
  /**
   * The seed the map was actually generated from: setupData's when it is a
   * valid int32, else the random fallback, so the match record is honest
   * (#82). Always set by `setup()`; optional only so hand-built states in
   * tests can leave it out.
   */
  mapSeed?: number;
  /**
   * East–west wrap of the map, or null if it does not wrap. All hex positions in
   * state are kept canonical (column in [0, columns)) under this wrap.
   */
  wrap: MapWrap;
  captainDeck: Captain[];
  draftHands: Record<string, Captain[]>;
  combat?: CombatState;
  /** The last round a fight settled (#380); none before a fight's first round settles. */
  lastRound?: SettledRound;
  floatingLoot: FloatingLoot[];
  npcIdCounter: number;
  /**
   * The last number each seat gave one of its missions' ids, by seat
   * (`nextMissionId`, #320). Private: a seat sees only its own
   * (`playerViewFor`), since another's count tells when it visits a tavern.
   * Always set by `setup()`; optional because matches stored before it lack
   * it, and a missing count reads as 0.
   */
  missionIdCounters?: Record<string, number>;
  /** The last number given to a floating loot's id (`nextLootId`, #320); as optional, for the same reason. */
  lootIdCounter?: number;
  /**
   * The players who have turned pirate, by player id (#201). Kept on the
   * player rather than the ship, so it outlives a sunk ship; an entry is
   * removed only when the player's captain is replaced (#265: the new
   * captain starts clean). Read it through
   * `isPlayerPirate`. Always set by `setup()`; optional only so hand-built
   * states in tests can leave it out (missing means nobody is a pirate).
   */
  pirates?: Record<string, PirateRecord>;
  /**
   * Every pirate bounty collected so far, oldest first (#201): the record
   * the HUD and sound events read. Optional for the same reason as `pirates`.
   */
  bountyClaims?: BountyClaim[];
  /**
   * The moves the current player has used this turn (#227): sailing a hex,
   * scouting, jury-rigging. Port actions are free and leave it alone. Reset
   * as each turn begins; read it through `movesUsed` / `movesLeft`
   * (turnMoves.ts). Always set by `setup()`; optional only so hand-built
   * states in tests can leave it out (missing means none used).
   */
  movesUsed?: number;
  /**
   * The seats whose ship is lost and whose captain died with it (#265), by
   * player id: from the loss until the seat picks a new captain at the
   * start of its next turn, or for good once it is out of the game
   * (`captainDeath.ts`). Their ship is gone from
   * `ships`, so what the player keeps waits here. Optional for the same
   * reason as `pirates` (missing means no seat is waiting).
   */
  lostShips?: Record<string, LostShip>;
  /**
   * When the open sea last wore each seat's ship down (#340): the
   * boardgame.io turn (`ctx.turn`) that ended, by player id, for the board's
   * "the open sea strains your hull" line. One entry per seat, so a seat's
   * wear is never lost to the next seat's. Optional: missing until the sea
   * first wears a ship, and in matches from before it.
   */
  seaWear?: Record<string, number>;
  /**
   * The event deck (#246): the draw pile, hidden, and the public log of the
   * last few events. Shuffled by `setup()`; optional because matches stored
   * before it lack it, and a missing deck reads as an empty pile, which the
   * first draw reshuffles (`drawEvent`), with an empty log.
   */
  eventDeck?: EventDeckState;
}

/** How a player's ship was lost: sunk, or (#258) taken by boarding. */
export type ShipLossCause = "sunk" | "taken";

/** A seat whose ship is lost (#265): the dead captain, and what the player keeps for the next. */
export interface LostShip {
  cause: ShipLossCause;
  /** The captain who died with the ship. */
  captain?: Captain;
  /** The player's glory, kept. */
  score: number;
  /** The player's stashed gold, kept; private to the seat like a ship's stash. */
  stashedGold: number;
  /**
   * Out of the game: no captain was left to deal when the seat's turn came
   * (#265). It keeps its glory, and has no ship and no more turns.
   */
  eliminated?: true;
}

/** How a player turned pirate: by sinking or by boarding an NPC merchant. */
export type PirateCause = "sink" | "board";

export interface PirateRecord {
  /** The game turn (`ctx.turn`) on which the player turned pirate. */
  turn: number;
  cause: PirateCause;
}

/** One nation's bounty on a pirate, paid to a captain who sails under that flag. */
export interface BountyClaim {
  captorId: string;
  pirateId: string;
  nation: Nation;
  gold: number;
  turn: number;
}
