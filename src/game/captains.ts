import type { Hex } from "./hex";
import { hexEquals } from "./hex";
import type { Captain, MapCell, Nation } from "./types";

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

export function findHomePort(
  nation: Nation,
  cells: MapCell[],
  occupiedHexes: Hex[],
): MapCell | undefined {
  const isOccupied = (h: Hex) => occupiedHexes.some((o) => hexEquals(o, h));
  // Prefer a port of the matching nation
  const match = cells.find(
    (c) => c.hasPort && c.nation === nation && !isOccupied(c.hex),
  );
  if (match) return match;
  // Fall back to any unoccupied port
  return cells.find((c) => c.hasPort && !isOccupied(c.hex));
}
