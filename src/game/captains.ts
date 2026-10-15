import type { Hex } from "./hex";
import { hexEquals, wrappedNeighbors } from "./hex";
import type { MapWrap } from "./hex";
import { SHIP_SPECS } from "./constants";
import type { Captain, CaribbeanState, MapCell, Nation, Region, ShipClass, ShipState } from "./types";

export const CAPTAINS: Captain[] = [
  // England (3)
  {
    id: "blackbeard",
    name: "Blackbeard",
    nation: "England",
    ability: "Intimidate: enemy ships cannot enter adjacent hexes",
  },
  {
    id: "morgan",
    name: "Henry Morgan",
    nation: "England",
    ability: "Raid: gain bonus gold when capturing merchant vessels",
  },
  {
    id: "drake",
    name: "Sir Francis Drake",
    nation: "England",
    ability: "Navigator: +1 movement range per turn",
  },
  // France (3)
  {
    id: "lolonois",
    name: "François l'Olonnais",
    nation: "France",
    ability: "Ruthless: double combat strength when boarding",
  },
  {
    id: "surcouf",
    name: "Robert Surcouf",
    nation: "France",
    ability: "Corsair: reduced port fees at French ports",
  },
  {
    id: "ducasse",
    name: "Jean-Baptiste Ducasse",
    nation: "France",
    ability: "Diplomat: can trade at enemy nation ports",
  },
  // Spain (3)
  {
    id: "devary",
    name: "Luis de Córdoba",
    nation: "Spain",
    ability: "Treasure Fleet: +1 max cargo capacity",
  },
  {
    id: "cofresí",
    name: "Roberto Cofresí",
    nation: "Spain",
    ability: "Robin Hood: gain gold when selling to poor ports",
  },
  {
    id: "amaro",
    name: "Amaro Pargo",
    nation: "Spain",
    ability: "Smuggler: buy goods at sell price once per turn",
  },
  // Netherlands (3)
  {
    id: "piet-hein",
    name: "Piet Hein",
    nation: "Netherlands",
    ability: "Plunder: steal cargo from defeated enemies",
  },
  {
    id: "hornigold",
    name: "Abraham Blauvelt",
    nation: "Netherlands",
    ability: "Explorer: reveal hidden map tiles in fog of war",
  },
  {
    id: "deruyter",
    name: "Michiel de Ruyter",
    nation: "Netherlands",
    ability: "Admiral: allied ships gain +1 defense when adjacent",
  },
];

/** Fisher-Yates shuffle using the provided rng. */
function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createCaptainDeck(rng: () => number): Captain[] {
  return shuffle(CAPTAINS, rng);
}

export function dealHands(
  deck: Captain[],
  numPlayers: number,
): { hands: Record<string, Captain[]>; remaining: Captain[] } {
  const hands: Record<string, Captain[]> = {};
  const remaining = [...deck];
  for (let i = 0; i < numPlayers; i++) {
    hands[String(i)] = remaining.splice(0, 2);
  }
  return { hands, remaining };
}

/** Where a drafted captain's ship starts, and the port it calls home. */
export interface HomeStart {
  position: Hex;
  /** The home port's own (land) hex. */
  homePortHex: Hex;
  /** The water hex the ship docks at to use its home port. */
  homeDockingHex: Hex;
}

/**
 * Where a captain of `nation` starts (#239). Among the ports in the nation's
 * region (by the port's own flag on a map without regions): docked at one
 * whose dock is free; else on a free water hex beside one of them, its dock
 * still home. Only if none of those has room, the same at any port on the
 * map. A port whose docking hex is not water docks at the water hex beside
 * it. Undefined only when no port (with a docking hex) has free water at
 * or beside it.
 */
export function findHomeStart(
  nation: Nation,
  cells: readonly MapCell[],
  occupiedHexes: readonly Hex[],
  regions: readonly Region[] = [],
  wrap: MapWrap = null,
): HomeStart | undefined {
  const isWater = (h: Hex) => cells.some((c) => hexEquals(c.hex, h) && c.terrain === "water");
  const isFree = (h: Hex) => isWater(h) && !occupiedHexes.some((o) => hexEquals(o, h));
  const inNationWaters = (c: MapCell) =>
    c.region !== undefined && regions[c.region] ? regions[c.region].nation === nation : c.nation === nation;

  const docked = (port: MapCell): HomeStart | undefined =>
    port.dockingHex && isFree(port.dockingHex)
      ? { position: port.dockingHex, homePortHex: port.hex, homeDockingHex: port.dockingHex }
      : undefined;
  const beside = (port: MapCell): HomeStart | undefined => {
    const free = wrappedNeighbors(port.hex, wrap).find(isFree);
    if (!free) return undefined;
    const dock = port.dockingHex && isWater(port.dockingHex) ? port.dockingHex : free;
    return { position: free, homePortHex: port.hex, homeDockingHex: dock };
  };
  const firstOf = (ports: readonly MapCell[]): HomeStart | undefined => {
    for (const p of ports) {
      const start = docked(p);
      if (start) return start;
    }
    for (const p of ports) {
      const start = beside(p);
      if (start) return start;
    }
    return undefined;
  };

  const ports = cells.filter((c) => c.hasPort && c.dockingHex);
  return firstOf(ports.filter(inNationWaters)) ?? firstOf(ports);
}

/**
 * Put `captain` in command of `playerId`'s `ship` as a `shipClass`, and
 * start it at their home port (`findHomeStart`) clear of every other
 * captained ship. The draft's pick and a replacement captain's (#265) both
 * come through here.
 */
export function takeCommand(
  G: CaribbeanState,
  playerId: string,
  ship: ShipState,
  captain: Captain,
  shipClass: ShipClass,
): void {
  ship.captain = captain;
  ship.shipClass = shipClass;
  const stats = structuredClone(SHIP_SPECS[shipClass]);
  ship.stats = stats;
  ship.maxCargo = stats.cargo;

  // Start at a home port in the captain's nation's region (#239)
  const occupiedHexes = Object.entries(G.ships)
    .filter(([id, s]) => id !== playerId && s.captain !== undefined)
    .map(([, s]) => s.position);
  const start = findHomeStart(captain.nation, G.cells, occupiedHexes, G.regions, G.wrap);
  if (start) {
    ship.position = start.position;
    ship.homePortHex = start.homePortHex;
    ship.homeDockingHex = start.homeDockingHex;
  }
}
