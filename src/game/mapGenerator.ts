import { hexGrid, hexDistance, neighbors, hexEquals, hexToWorld } from "./hex";
import type { Hex } from "./hex";
import type { Terrain } from "./terrain";
import type { MapCell, PortNation, Decoration } from "./types";
import { NATIONS } from "./types";
import { generatePortMarket } from "./economy";

export type { MapCell } from "./types";

const MIN_ISLAND_DISTANCE = 3; // Minimum distance between islands
const MIN_ISLAND_SIZE = 3; // Minimum island size
const MAX_ISLAND_SIZE = 10; // Maximum island size
const MIN_PORT_ISLAND_SIZE = 3; // Minimum island size to have a port
const SHIPYARD_CHANCE = 0.5;
const REEF_CHANCE = 0.2; // 20% of coastal hexes become reefs

/** Get max ports based on map radius */
function getMaxPorts(radius: number): number {
  if (radius <= 12) return 5;      // small
  if (radius <= 18) return 10;     // medium
  return 15;                        // large
}

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

/** Find the docking water hex for a port (where ships dock) */
function findDockingHex(
  portHex: Hex,
  waterHexes: Set<string>,
  reefHexes: Set<string>,
  hexKey: (h: Hex) => string
): Hex | null {
  // Find an adjacent water hex that has at least one other navigable neighbor
  // (so ships can actually leave the port)
  const adjacentHexes = neighbors(portHex);

  for (const neighbor of adjacentHexes) {
    const key = hexKey(neighbor);
    if (waterHexes.has(key)) {
      // Check if this docking hex has at least one other navigable neighbor
      // (water or reef - somewhere the ship can move to)
      const dockingNeighbors = neighbors(neighbor);
      const hasExit = dockingNeighbors.some((n) => {
        if (hexEquals(n, portHex)) return false; // Don't count the port itself
        const nKey = hexKey(n);
        return waterHexes.has(nKey) || reefHexes.has(nKey);
      });

      if (hasExit) {
        return neighbor;
      }
    }
  }

  // Fallback: return any water hex even if trapped (better than no port)
  for (const neighbor of adjacentHexes) {
    const key = hexKey(neighbor);
    if (waterHexes.has(key)) {
      return neighbor;
    }
  }

  return null;
}

/** Calculate pier direction towards the docking hex */
function calculatePierDirection(
  portHex: Hex,
  dockingHex: Hex | null
): number {
  if (!dockingHex) return 0; // Default rotation if no docking hex

  // Calculate world positions
  const [portX, , portZ] = hexToWorld(portHex);
  const [waterX, , waterZ] = hexToWorld(dockingHex);

  // Calculate angle from port to water (rotation around Y axis)
  const dx = waterX - portX;
  const dz = waterZ - portZ;
  return Math.atan2(dx, dz);
}

/** Generate decorations for a land hex */
function generateDecorations(
  terrain: Terrain,
  hasPort: boolean,
  rng: () => number,
  dockingHex?: Hex | null,
  portHex?: Hex
): Decoration[] {
  if (terrain !== "island") return [];

  const decorations: Decoration[] = [];

  // Port hexes get a fort and a pier (no trees/rocks)
  if (hasPort && portHex) {
    // Calculate pier direction towards docking hex
    const pierRotation = calculatePierDirection(portHex, dockingHex ?? null);

    decorations.push({
      type: "fort",
      position: [0, 0, 0.3],
      rotation: 0,
    });
    // Pier extends from shore into adjacent water hex
    decorations.push({
      type: "pier",
      position: [0, 0, 0],
      rotation: pierRotation,
    });

    return decorations;
  }

  // Non-port islands get 1-3 random trees/rocks
  const count = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    decorations.push({
      type: rng() > 0.3 ? "tree" : "rock",
      position: [
        (rng() - 0.5) * 1.2,
        0,
        (rng() - 0.5) * 1.2,
      ],
      rotation: rng() * Math.PI * 2,
      scale: 0.7 + rng() * 0.6,
    });
  }

  return decorations;
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

  // Build set of all island hex keys for quick lookup
  const allIslandKeys = new Set<string>();
  for (const island of islands) {
    for (const h of island) {
      allIslandKeys.add(hexKey(h));
    }
  }

  // Build set of all grid hex keys for boundary check
  const gridHexKeys = new Set<string>(grid.map(hexKey));

  const maxPorts = getMaxPorts(radius);
  for (const island of islands) {
    // Stop if we've reached the maximum number of ports
    if (portKeys.length >= maxPorts) break;

    if (island.length >= MIN_PORT_ISLAND_SIZE) {
      // Filter to hexes that have at least one on-grid water neighbor
      const coastalHexes = island.filter((h) =>
        neighbors(h).some((n) => {
          const nKey = hexKey(n);
          // Neighbor must be on the grid AND not an island
          return gridHexKeys.has(nKey) && !allIslandKeys.has(nKey);
        })
      );

      // Pick a random coastal hex for the port (fallback to any hex if none found)
      const candidates = coastalHexes.length > 0 ? coastalHexes : island;
      const portHex = candidates[Math.floor(rng() * candidates.length)];
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

  // Identify coastal water hexes (adjacent to any island) for reef generation
  const islandHexSet = new Set<string>();
  for (const island of islands) {
    for (const h of island) {
      islandHexSet.add(hexKey(h));
    }
  }

  // Build set of hexes adjacent to ports (these must stay as water for ship exit)
  const portAdjacentHexes = new Set<string>();
  for (const portKey of portKeys) {
    const [q, r] = portKey.split(",").map(Number);
    const portHex = { q, r, s: -q - r };
    for (const neighbor of neighbors(portHex)) {
      const neighborKey = hexKey(neighbor);
      // Only mark non-island neighbors as port-adjacent
      if (!islandHexSet.has(neighborKey)) {
        portAdjacentHexes.add(neighborKey);
      }
    }
  }

  const reefHexes = new Set<string>();
  for (const h of grid) {
    const key = hexKey(h);
    // Only water hexes can become reefs (exclude center hex and port-adjacent hexes)
    if (islandHexSet.has(key)) continue;
    if (h.q === 0 && h.r === 0) continue; // Center hex stays water
    if (portAdjacentHexes.has(key)) continue; // Port exits must stay water
    // Check if adjacent to any island
    const isCoastal = neighbors(h).some((n) => islandHexSet.has(hexKey(n)));
    if (isCoastal && rng() < REEF_CHANCE) {
      reefHexes.add(key);
    }
  }

  // Build set of water hexes (not island, not reef)
  const waterHexes = new Set<string>();
  for (const h of grid) {
    const key = hexKey(h);
    if (!islandHexSet.has(key) && !reefHexes.has(key)) {
      waterHexes.add(key);
    }
  }

  // Calculate docking hex for each port
  const portDockingHexes = new Map<string, Hex>();
  for (const portKey of portKeys) {
    const [q, r] = portKey.split(",").map(Number);
    const portHex = { q, r, s: -q - r };
    const dockingHex = findDockingHex(portHex, waterHexes, reefHexes, hexKey);
    if (dockingHex) {
      portDockingHexes.set(portKey, dockingHex);
    }
  }

  // Build the final map cells
  return grid.map((h) => {
    const key = hexKey(h);
    const isIsland = hexToIsland.has(key);
    const isReef = reefHexes.has(key);
    const terrain: Terrain = isIsland ? "island" : isReef ? "reef" : "water";
    const hasPort = portHexes.has(key);

    const cell: MapCell = { hex: h, terrain, hasPort };
    if (hasPort) {
      cell.market = generatePortMarket(rng);
      cell.nation = portNations.get(key);
      cell.portName = portNames.get(key);
      cell.hasShipyard = portShipyards.get(key);
      cell.dockingHex = portDockingHexes.get(key);
    }

    // Generate decorations for island hexes
    const dockingHex = hasPort ? portDockingHexes.get(key) : undefined;
    const decorations = generateDecorations(
      terrain,
      hasPort,
      rng,
      dockingHex,
      hasPort ? h : undefined
    );
    if (decorations.length > 0) {
      cell.decorations = decorations;
    }

    return cell;
  });
}
