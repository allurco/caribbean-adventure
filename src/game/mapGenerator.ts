import { hexGrid, hexDistance, neighbors, hexEquals } from "./hex";
import type { Hex } from "./hex";
import type { Terrain } from "./terrain";
import type { MapCell, PortNation } from "./types";
import { NATIONS } from "./types";
import { generatePortMarket } from "./economy";

export type { MapCell } from "./types";

const MIN_ISLAND_DISTANCE = 3; // Minimum distance between islands
const MIN_ISLAND_SIZE = 3; // Minimum island size
const MAX_ISLAND_SIZE = 10; // Maximum island size
const MIN_PORT_ISLAND_SIZE = 3; // Minimum island size to have a port
const SHIPYARD_CHANCE = 0.5;

// Fictional Caribbean-style port names
const PORT_NAMES = [
  // Regular ports
  "Puerto Dorado",
  "Bahía Escarlata",
  "Porto Velho",
  "Île de Sable",
  "Windward Cove",
  "Marisma Bay",
  "Coral Haven",
  "Serpent's Landing",
  "Aguamarina",
  "Stormwatch Point",
  "Bahía del Sol",
  "Crescent Harbor",
  "Palmira",
  "Anchor's Rest",
  "Velasquez Port",
  "Emerald Shoals",
  "Thornwood Bay",
  "Seahaven",
  "Isla Quieta",
  "Redwater Cay",
];

// Pirate haven names
const PIRATE_PORT_NAMES = [
  "Skull Cove",
  "Cutthroat Bay",
  "The Black Anchor",
  "Freebooter's Rest",
  "Rogue's Haven",
  "Dead Man's Harbor",
  "The Kraken's Maw",
  "Blacksail Refuge",
];

/** Simple seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffle array in place using Fisher-Yates */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Check if a hex is at least minDist away from all hexes in the set */
function isFarEnough(hex: Hex, existingIslandHexes: Hex[], minDist: number): boolean {
  for (const existing of existingIslandHexes) {
    if (hexDistance(hex, existing) < minDist) {
      return false;
    }
  }
  return true;
}

/** Grow an island from a seed hex to target size using BFS on neighbors */
function growIsland(
  seed: Hex,
  targetSize: number,
  validHexes: Set<string>,
  usedHexes: Set<string>,
  rng: () => number
): Hex[] {
  const island: Hex[] = [seed];
  const hexKey = (h: Hex) => `${h.q},${h.r}`;
  const localUsed = new Set<string>([hexKey(seed)]);

  while (island.length < targetSize) {
    // Find all candidate hexes adjacent to the current island
    const candidates: Hex[] = [];
    for (const h of island) {
      for (const n of neighbors(h)) {
        const key = hexKey(n);
        if (validHexes.has(key) && !usedHexes.has(key) && !localUsed.has(key)) {
          // Check it's not already in candidates
          if (!candidates.some((c) => hexEquals(c, n))) {
            candidates.push(n);
          }
        }
      }
    }

    if (candidates.length === 0) break; // Can't grow further

    // Pick a random candidate
    const pick = candidates[Math.floor(rng() * candidates.length)];
    island.push(pick);
    localUsed.add(hexKey(pick));
  }

  return island;
}

export function generateMap(radius: number, seed?: number): MapCell[] {
  const rng = seed !== undefined ? mulberry32(seed) : Math.random;
  const grid = hexGrid(radius);

  const hexKey = (h: Hex) => `${h.q},${h.r}`;

  // Create a set of all valid hexes (excluding center)
  const validHexes = new Set<string>();
  for (const h of grid) {
    if (!(h.q === 0 && h.r === 0)) {
      validHexes.add(hexKey(h));
    }
  }

  // Track all used hexes (for island growth) and all island hexes (for distance checks)
  const usedHexes = new Set<string>();
  const allIslandHexes: Hex[] = [];
  const islands: Hex[][] = [];

  // Get candidate seed positions (shuffled for randomness)
  const candidateSeeds = grid.filter((h) => !(h.q === 0 && h.r === 0));
  shuffle(candidateSeeds, rng);

  // Determine target number of islands based on map size
  // More islands for larger maps, aiming for good coverage with open water
  const totalHexes = grid.length;
  const targetIslands = Math.max(3, Math.floor(totalHexes / 40));

  // Place island seeds with minimum distance constraint
  for (const candidate of candidateSeeds) {
    if (islands.length >= targetIslands) break;

    // Check if this candidate is far enough from all existing island hexes
    if (isFarEnough(candidate, allIslandHexes, MIN_ISLAND_DISTANCE)) {
      // Random island size between MIN and MAX
      const targetSize = MIN_ISLAND_SIZE + Math.floor(rng() * (MAX_ISLAND_SIZE - MIN_ISLAND_SIZE + 1));

      // Grow the island from this seed
      const island = growIsland(candidate, targetSize, validHexes, usedHexes, rng);

      // Verify ALL hexes in the grown island are far enough from existing islands
      const allFarEnough = island.every((h) =>
        isFarEnough(h, allIslandHexes, MIN_ISLAND_DISTANCE)
      );

      if (allFarEnough) {
        islands.push(island);
        allIslandHexes.push(...island);
        // Commit the used hexes
        for (const h of island) {
          usedHexes.add(hexKey(h));
        }
      }
    }
  }

  // Build a map of hex -> island index for quick lookup
  const hexToIsland = new Map<string, number>();
  for (let i = 0; i < islands.length; i++) {
    for (const h of islands[i]) {
      hexToIsland.set(hexKey(h), i);
    }
  }

  // Determine which islands get ports (only islands with exactly ISLAND_SIZE hexes)
  // and pick one hex per island to be the port
  const portHexes = new Set<string>();
  const portShipyards = new Map<string, boolean>();
  const portKeys: string[] = []; // Track order of port creation for nation assignment

  for (const island of islands) {
    if (island.length >= MIN_PORT_ISLAND_SIZE) {
      // Pick a random hex in the island for the port
      const portHex = island[Math.floor(rng() * island.length)];
      const key = hexKey(portHex);
      portHexes.add(key);
      portKeys.push(key);
      portShipyards.set(key, rng() < SHIPYARD_CHANCE);
    }
  }

  // Assign nations and names to ports
  // First, ensure at least one pirate port (pick a random port to be pirate)
  // Then assign regular nations round-robin to the rest
  const portNations = new Map<string, PortNation>();
  const portNames = new Map<string, string>();

  if (portKeys.length > 0) {
    // Shuffle port names for variety
    const shuffledNames = [...PORT_NAMES];
    for (let i = shuffledNames.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffledNames[i], shuffledNames[j]] = [shuffledNames[j], shuffledNames[i]];
    }

    // Pick one random port to be a pirate haven
    const pirateIndex = Math.floor(rng() * portKeys.length);
    const piratePortKey = portKeys[pirateIndex];
    portNations.set(piratePortKey, "Pirate");
    // Pirate ports always have shipyards (they cater to outlaws)
    portShipyards.set(piratePortKey, true);
    // Assign a pirate-themed name
    const pirateNameIndex = Math.floor(rng() * PIRATE_PORT_NAMES.length);
    portNames.set(piratePortKey, PIRATE_PORT_NAMES[pirateNameIndex]);

    // Assign regular nations and names to remaining ports (round-robin)
    let nationIndex = 0;
    let nameIndex = 0;
    for (const key of portKeys) {
      if (key !== piratePortKey) {
        portNations.set(key, NATIONS[nationIndex % NATIONS.length]);
        portNames.set(key, shuffledNames[nameIndex % shuffledNames.length]);
        nationIndex++;
        nameIndex++;
      }
    }
  }

  // Build the final map cells
  return grid.map((hex) => {
    const key = hexKey(hex);
    const isIsland = hexToIsland.has(key);
    const terrain: Terrain = isIsland ? "island" : "water";
    const hasPort = portHexes.has(key);

    const cell: MapCell = { hex, terrain, hasPort };
    if (hasPort) {
      cell.market = generatePortMarket(rng);
      cell.nation = portNations.get(key);
      cell.portName = portNames.get(key);
      cell.hasShipyard = portShipyards.get(key);
    }
    return cell;
  });
}
