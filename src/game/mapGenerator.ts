import {
  canonicalHex,
  createWrap,
  hexDistance,
  hexEquals,
  hexRect,
  hexToOffset,
  hexToWorld,
  nearestImage,
  neighbors,
  wrappedDistance,
  wrappedNeighbors,
} from "./hex";
import type { Hex, MapWrap } from "./hex";
import type { MapDimensions } from "./mapConfig";
import type { Terrain } from "./terrain";
import type { MapCell, PortNation, Decoration, Elevation, Biome, Region, RegionId } from "./types";
import { REGION_CHANNEL, REGION_NATIONS, assignRegions, buildRegionTable, placeRegionCentres } from "./regions";
import { generatePortMarket } from "./economy";

export type { MapCell } from "./types";

const MIN_ISLAND_DISTANCE = 3; // Minimum distance between islands
const MIN_ISLAND_SIZE = 3; // Minimum island size
const MAX_ISLAND_SIZE = 10; // Maximum island size
const ISLET_MAX_SIZE = 5; // Islands without a port are islets: the ports' islands carry the big land
const MIN_PORT_ISLAND_SIZE = 3; // Minimum island size to have a port
const SHIPYARD_CHANCE = 0.5;
const REEF_CHANCE = 0.2; // 20% of coastal hexes become reefs

/**
 * Rows at the north and south edges kept as open sea: the edge row and the two
 * next to it never hold an island, port or reef, so the map ends in water.
 */
export const OPEN_SEA_EDGE_ROWS = 3;

/**
 * Ports in each nation's region (#239): 2 on the small map, 3 on the medium
 * and 4 on the large. The pirate region holds one, the pirate haven.
 */
function portsPerNationRegion(cellCount: number): number {
  if (cellCount <= 600) return 2;
  if (cellCount <= 1100) return 3;
  return 4;
}

/** Tries at a region layout before the generator keeps its best one (only too small a map runs out). */
const REGION_LAYOUT_ATTEMPTS = 64;

/** How loosely a region's islands keep to its centre: seeds are taken by distance plus up to this. */
const REGION_SEED_JITTER = 3;

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

/** Key of a (canonical) hex for the generator's lookup sets. */
const hexKey = (h: Hex): string => `${h.q},${h.r}`;

/** Find the docking water hex for a port (where ships dock) */
function findDockingHex(
  portHex: Hex,
  waterHexes: Set<string>,
  reefHexes: Set<string>,
  wrap: MapWrap
): Hex | null {
  // Find an adjacent water hex that has at least one other navigable neighbor
  // (so ships can actually leave the port)
  const adjacentHexes = wrappedNeighbors(portHex, wrap);

  for (const neighbor of adjacentHexes) {
    const key = hexKey(neighbor);
    if (waterHexes.has(key)) {
      // Check if this docking hex has at least one other navigable neighbor
      // (water or reef - somewhere the ship can move to)
      const dockingNeighbors = wrappedNeighbors(neighbor, wrap);
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
  dockingHex: Hex | null,
  wrap: MapWrap
): number {
  if (!dockingHex) return 0; // Default rotation if no docking hex

  // Calculate world positions (the docking hex's copy next to the port, across the seam if need be)
  const [portX, , portZ] = hexToWorld(portHex);
  const [waterX, , waterZ] = hexToWorld(nearestImage(portHex, dockingHex, wrap));

  // Calculate angle from port to water (rotation around Y axis)
  const dx = waterX - portX;
  const dz = waterZ - portZ;
  return Math.atan2(dx, dz);
}

/** Generate decorations for a land hex based on biome */
function generateDecorations(
  terrain: Terrain,
  hasPort: boolean,
  rng: () => number,
  pierRotation: number,
  elevation?: Elevation,
  biome?: Biome
): Decoration[] {
  if (terrain !== "island") return [];

  const decorations: Decoration[] = [];

  // Port hexes get a fort and a pier (no trees/rocks); the pier faces the docking hex
  if (hasPort) {
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

  // Generate decorations based on biome
  // Spread values kept tight to avoid decorations at hex edges where elevation changes
  if (biome === "ROCK" || elevation === 3) {
    // Mountain: only rocks, 1-2
    const count = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      decorations.push({
        type: "rock",
        position: [
          (rng() - 0.5) * 0.5, // Tighter spread for elevated hexes
          0,
          (rng() - 0.5) * 0.5,
        ],
        rotation: rng() * Math.PI * 2,
        scale: 0.8 + rng() * 0.8, // Bigger rocks on mountains
      });
    }
  } else if (biome === "GRASS" || elevation === 2) {
    // Jungle: many trees, few rocks
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      decorations.push({
        type: rng() > 0.15 ? "tree" : "rock", // 85% trees
        position: [
          (rng() - 0.5) * 0.7, // Tighter spread for elevated hexes
          0,
          (rng() - 0.5) * 0.7,
        ],
        rotation: rng() * Math.PI * 2,
        scale: 0.8 + rng() * 0.6,
      });
    }
  } else if (biome === "SAND" || elevation === 1) {
    // Beach: few decorations, sparse trees and rocks
    const count = Math.floor(rng() * 2); // 0-1 decorations
    for (let i = 0; i < count; i++) {
      decorations.push({
        type: rng() > 0.5 ? "tree" : "rock", // 50/50
        position: [
          (rng() - 0.5) * 0.6, // Tighter spread
          0,
          (rng() - 0.5) * 0.6,
        ],
        rotation: rng() * Math.PI * 2,
        scale: 0.6 + rng() * 0.4, // Smaller
      });
    }
  } else {
    // Default fallback (shouldn't happen for islands)
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
  }

  return decorations;
}

/**
 * Find the center hex of an island (centroid approximation).
 * For small islands, use the hex closest to the geometric center.
 */
function findIslandCenter(island: Hex[]): Hex {
  if (island.length === 1) return island[0];

  // Calculate geometric center (average of q, r coordinates)
  let sumQ = 0;
  let sumR = 0;
  for (const h of island) {
    sumQ += h.q;
    sumR += h.r;
  }
  const centerQ = sumQ / island.length;
  const centerR = sumR / island.length;

  // Find the hex closest to this center
  let closest = island[0];
  let minDist = Infinity;
  for (const h of island) {
    const dist = Math.abs(h.q - centerQ) + Math.abs(h.r - centerR);
    if (dist < minDist) {
      minDist = dist;
      closest = h;
    }
  }
  return closest;
}

/**
 * Calculate elevation for a hex based on its distance from the island center.
 * - Distance 0 (center): Mountain (3)
 * - Distance 1: Jungle (2)
 * - Distance 2+: Beach (1)
 * - Water: elevation 0
 */
function calculateElevation(
  hex: Hex,
  islandCenter: Hex | null,
  isIsland: boolean,
  islandSize: number
): Elevation {
  if (!isIsland || !islandCenter) return 0; // Water

  const dist = hexDistance(hex, islandCenter);

  // For very small islands (1-2 hexes), don't create mountains
  if (islandSize <= 2) return 1; // All beach

  // For small islands (3-4 hexes), center is jungle, rest is beach
  if (islandSize <= 4) {
    if (dist === 0) return 2; // Jungle center
    return 1; // Beach
  }

  // For larger islands, create full volcano shape
  if (dist === 0) return 3; // Mountain peak
  if (dist === 1) return 2; // Jungle slopes
  return 1; // Beach edges
}

/**
 * Get the biome for a hex based on its elevation.
 */
function getBiome(elevation: Elevation): Biome | undefined {
  switch (elevation) {
    case 1: return "SAND";
    case 2: return "GRASS";
    case 3: return "ROCK";
    default: return undefined; // Water has no biome
  }
}

/**
 * Grow an island from a seed hex to target size using BFS on neighbors.
 *
 * The island comes back as one contiguous patch around the seed: a hex grown
 * across the seam keeps its unwrapped coordinates (e.g. q = -1 rather than
 * q = columns - 1), so its centre and distances need no seam handling.
 * `canGrowInto` and the de-duplication work on canonical hexes.
 */
function growIsland(
  seed: Hex,
  targetSize: number,
  canGrowInto: (canonical: Hex) => boolean,
  rng: () => number,
  wrap: MapWrap
): Hex[] {
  const island: Hex[] = [seed];
  const localUsed = new Set<string>([hexKey(canonicalHex(seed, wrap))]);

  while (island.length < targetSize) {
    // Find all candidate hexes adjacent to the current island
    const candidates: Hex[] = [];
    const candidateKeys = new Set<string>();
    for (const h of island) {
      for (const n of neighbors(h)) {
        const key = hexKey(canonicalHex(n, wrap));
        if (localUsed.has(key) || candidateKeys.has(key)) continue;
        if (canGrowInto(canonicalHex(n, wrap))) {
          candidateKeys.add(key);
          candidates.push(n);
        }
      }
    }

    if (candidates.length === 0) break; // Can't grow further

    // Pick a random candidate
    const pick = candidates[Math.floor(rng() * candidates.length)];
    island.push(pick);
    localUsed.add(hexKey(canonicalHex(pick, wrap)));
  }

  return island;
}

/** Islands laid out region by region: the contiguous patches, whose region each is, and which carry a port. */
interface RegionLayout {
  centres: Hex[];
  patches: Hex[][];
  regionOfPatch: RegionId[];
  portIsland: boolean[];
  /** Port islands short of the regions' quotas: 0 when every region got its ports. */
  missing: number;
}

/**
 * Lay the islands out as one cluster per region (#239). Region centres are
 * spread over `candidates` and each candidate hex belongs to the nearest
 * centre's territory; a region grows its islands only in its territory,
 * nearest its centre first. Islands of one region keep `MIN_ISLAND_DISTANCE`
 * apart, and land of different regions `REGION_CHANNEL` apart, round the seam.
 * First every region takes turns placing its port islands (`quotas`, by
 * region id), then extra islands up to `targetIslands` in all.
 */
function layOutRegionsOnce(
  candidates: readonly Hex[],
  quotas: readonly number[],
  targetIslands: number,
  rng: () => number,
  wrap: MapWrap
): RegionLayout {
  const centres = placeRegionCentres(candidates, REGION_NATIONS.length, rng, wrap);
  const territory = new Map<string, RegionId>();
  for (const h of candidates) {
    let nearest = 0;
    let nearestDistance = Infinity;
    centres.forEach((c, id) => {
      const d = wrappedDistance(c, h, wrap);
      if (d < nearestDistance) {
        nearest = id;
        nearestDistance = d;
      }
    });
    territory.set(hexKey(h), nearest);
  }

  // Each region's island seeds, nearest its centre first, loosely
  const seeds = centres.map((centre, id) =>
    candidates
      .filter((h) => territory.get(hexKey(h)) === id)
      .map((h) => ({ h, order: wrappedDistance(centre, h, wrap) + rng() * REGION_SEED_JITTER }))
      .sort((a, b) => a.order - b.order)
      .map(({ h }) => h)
  );
  const nextSeed = centres.map(() => 0);

  const land: { hex: Hex; region: RegionId }[] = [];
  const used = new Set<string>();
  const fits = (h: Hex, region: RegionId): boolean =>
    land.every(
      (other) => wrappedDistance(h, other.hex, wrap) >= (other.region === region ? MIN_ISLAND_DISTANCE : REGION_CHANNEL)
    );

  const patches: Hex[][] = [];
  const regionOfPatch: RegionId[] = [];
  const portIsland: boolean[] = [];

  /** Grow one island in `region`'s territory, or report that it has no room left. */
  const placeIsland = (region: RegionId, minSize: number, maxSize: number, port: boolean): boolean => {
    const canGrowInto = (h: Hex): boolean => {
      const key = hexKey(h);
      return territory.get(key) === region && !used.has(key) && fits(h, region);
    };
    while (nextSeed[region] < seeds[region].length) {
      const seed = seeds[region][nextSeed[region]++];
      if (!canGrowInto(seed)) continue;
      const targetSize = minSize + Math.floor(rng() * (maxSize - minSize + 1));
      const patch = growIsland(seed, targetSize, canGrowInto, rng, wrap);
      if (patch.length < minSize) continue;
      for (const h of patch) {
        const canonical = canonicalHex(h, wrap);
        used.add(hexKey(canonical));
        land.push({ hex: canonical, region });
      }
      patches.push(patch);
      regionOfPatch.push(region);
      portIsland.push(port);
      return true;
    }
    return false;
  };

  // Port islands first, the regions taking turns in a seeded order
  const order = shuffle(centres.map((_, id) => id), rng);
  const owed = [...quotas];
  let placing = order.filter((id) => owed[id] > 0);
  while (placing.length > 0) {
    placing = placing.filter((id) => {
      if (!placeIsland(id, MIN_PORT_ISLAND_SIZE, MAX_ISLAND_SIZE, true)) return false;
      owed[id]--;
      return owed[id] > 0;
    });
  }

  // Then islets without a port, until the map has its share
  let growing = [...order];
  while (growing.length > 0 && patches.length < targetIslands) {
    growing = growing.filter((id) => patches.length < targetIslands && placeIsland(id, MIN_ISLAND_SIZE, ISLET_MAX_SIZE, false));
  }

  return { centres, patches, regionOfPatch, portIsland, missing: owed.reduce((a, b) => a + b, 0) };
}

/**
 * The region layout: the first try whose regions all get their port islands,
 * else (only on a map too small for them) the try that came closest.
 */
function layOutRegions(
  candidates: readonly Hex[],
  quotas: readonly number[],
  targetIslands: number,
  rng: () => number,
  wrap: MapWrap
): RegionLayout {
  let best: RegionLayout | null = null;
  for (let attempt = 0; attempt < REGION_LAYOUT_ATTEMPTS; attempt++) {
    const layout = layOutRegionsOnce(candidates, quotas, targetIslands, rng, wrap);
    if (layout.missing === 0) return layout;
    if (!best || layout.missing < best.missing) best = layout;
  }
  return best!;
}

/**
 * Generate a rectangular map of `dimensions.columns × dimensions.rows` hexes
 * (see `hexRect`), every cell stored canonically.
 *
 * With a `wrap` the map is generated as a cylinder: islands may grow across
 * the east–west seam, and spacing, coasts, reefs and docking all use the
 * wrapped hex maths, so the result has no seam. Without one the east and west
 * edges are hard and nothing crosses them. The north and south edges are always
 * open sea (`OPEN_SEA_EDGE_ROWS`).
 *
 * The seed is required (#160): the same seed always gives the same map, and
 * there is no unseeded fallback for clients to disagree on.
 */
export function generateMap(dimensions: MapDimensions, seed: number, wrap: MapWrap = null): MapCell[] {
  return generateWorld(dimensions, seed, wrap).cells;
}

/** A generated map: its cells, each naming its region, and the region table (#239). */
export interface MapWorld {
  cells: MapCell[];
  regions: Region[];
}

/**
 * The map `generateMap` makes, with its regions (#239): five, one per nation
 * plus the Pirates, each a cluster of islands whose ports fly its flag, kept
 * apart by open-sea channels (`REGION_CHANNEL`). Every cell, water too, names
 * the region of its nearest land.
 */
export function generateWorld(dimensions: MapDimensions, seed: number, wrap: MapWrap = null): MapWorld {
  const { columns, rows } = dimensions;
  if (!Number.isInteger(columns) || columns % 2 !== 0) {
    throw new Error(`Map width must be an even number of columns, got ${columns}`);
  }
  if (wrap && wrap.columns !== columns) {
    throw new Error(`Wrap width ${wrap.columns} does not match the map's ${columns} columns`);
  }
  if (wrap) createWrap(wrap.columns); // validates the wrap itself

  if (!Number.isInteger(seed)) {
    throw new Error(`The map generator needs an integer seed, got ${seed}`);
  }

  const rng = mulberry32(seed);
  const grid = hexRect(columns, rows);

  // Hexes an island may cover: everything but the open-sea rows at the north and south edges
  const isOpenSeaRow = (h: Hex): boolean => {
    const { row } = hexToOffset(h);
    return row < OPEN_SEA_EDGE_ROWS || row >= rows - OPEN_SEA_EDGE_ROWS;
  };
  const validHexes = new Set<string>();
  for (const h of grid) {
    if (!isOpenSeaRow(h)) {
      validHexes.add(hexKey(h));
    }
  }

  // Lay the islands out region by region (#239): five clusters, each round
  // its region's centre, with open-sea channels between them.
  const candidates = grid.filter((h) => validHexes.has(hexKey(h)));
  const quotas = REGION_NATIONS.map((nation) => (nation === "Pirate" ? 1 : portsPerNationRegion(grid.length)));
  const targetIslands = quotas.reduce((a, b) => a + b, 0) + Math.floor(grid.length / 60);
  const layout = layOutRegions(candidates, quotas, targetIslands, rng, wrap);
  const islandPatches = layout.patches;

  // The islands' cells, canonically
  const islands = islandPatches.map((patch) => patch.map((h) => canonicalHex(h, wrap)));

  // Build a map of hex -> island index for quick lookup
  const hexToIsland = new Map<string, number>();
  for (let i = 0; i < islands.length; i++) {
    for (const h of islands[i]) {
      hexToIsland.set(hexKey(h), i);
    }
  }

  // Elevation of every island hex, from its distance to the island's centre
  // (measured on the contiguous patch, so it is right across the seam)
  const islandElevations = new Map<string, Elevation>();
  for (const patch of islandPatches) {
    const center = findIslandCenter(patch);
    for (const h of patch) {
      islandElevations.set(hexKey(canonicalHex(h, wrap)), calculateElevation(h, center, true, patch.length));
    }
  }

  // One port on each port island, flying its region's flag
  const portHexes = new Set<string>();
  const portShipyards = new Map<string, boolean>();
  const portNations = new Map<string, PortNation>();
  const portNames = new Map<string, string>();
  const portKeys: string[] = [];

  // Build set of all island hex keys for quick lookup
  const allIslandKeys = new Set<string>();
  for (const island of islands) {
    for (const h of island) {
      allIslandKeys.add(hexKey(h));
    }
  }

  // Build set of all grid hex keys for boundary check
  const gridHexKeys = new Set<string>(grid.map(hexKey));

  const shuffledNames = shuffle([...PORT_NAMES], rng);
  let nameIndex = 0;
  islands.forEach((island, i) => {
    if (!layout.portIsland[i]) return;
    // Filter to hexes that have at least one on-grid water neighbor (coastal)
    const coastalHexes = island.filter((h) =>
      wrappedNeighbors(h, wrap).some((n) => {
        const nKey = hexKey(n);
        // Neighbor must be on the grid AND not an island
        return gridHexKeys.has(nKey) && !allIslandKeys.has(nKey);
      })
    );

    // Ports must be on beach hexes (elevation 1), which are coastal hexes
    // that are NOT at the center (distance > 1 from center for large islands)
    const beachHexes = coastalHexes.filter((h) => islandElevations.get(hexKey(h)) === 1);

    // Pick a random beach hex for the port (fallback to a coastal slope, so a
    // small island keeps its peak, then any coastal hex, then any hex)
    const slopeHexes = coastalHexes.filter((h) => islandElevations.get(hexKey(h)) !== 3);
    const portCandidates = [beachHexes, slopeHexes, coastalHexes, island].find((hexes) => hexes.length > 0)!;
    const portHex = portCandidates[Math.floor(rng() * portCandidates.length)];
    const key = hexKey(portHex);
    portHexes.add(key);
    portKeys.push(key);
    const nation = REGION_NATIONS[layout.regionOfPatch[i]];
    portNations.set(key, nation);
    if (nation === "Pirate") {
      // The pirate haven always has a shipyard (it caters to outlaws) and a pirate name
      portShipyards.set(key, true);
      portNames.set(key, PIRATE_PORT_NAMES[Math.floor(rng() * PIRATE_PORT_NAMES.length)]);
    } else {
      portShipyards.set(key, rng() < SHIPYARD_CHANCE);
      portNames.set(key, shuffledNames[nameIndex++ % shuffledNames.length]);
    }
  });

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
    for (const neighbor of wrappedNeighbors(portHex, wrap)) {
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
    // Only water hexes can become reefs (exclude the open-sea edges and port-adjacent hexes)
    if (islandHexSet.has(key)) continue;
    if (isOpenSeaRow(h)) continue; // The north and south edges stay open sea
    if (portAdjacentHexes.has(key)) continue; // Port exits must stay water
    // Check if adjacent to any island
    const isCoastal = wrappedNeighbors(h, wrap).some((n) => islandHexSet.has(hexKey(n)));
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
    const dockingHex = findDockingHex(portHex, waterHexes, reefHexes, wrap);
    if (dockingHex) {
      portDockingHexes.set(portKey, dockingHex);
    }
  }

  // Every hex takes the region of its nearest land
  const landRegions = new Map<string, RegionId>();
  islands.forEach((island, i) => {
    for (const h of island) landRegions.set(hexKey(h), layout.regionOfPatch[i]);
  });
  const hexRegions = assignRegions(grid, landRegions, layout.centres, wrap);

  // Build the final map cells
  const cells = grid.map((h) => {
    const key = hexKey(h);
    const isIsland = hexToIsland.has(key);
    const isReef = reefHexes.has(key);
    const terrain: Terrain = isIsland ? "island" : isReef ? "reef" : "water";
    const hasPort = portHexes.has(key);

    // Ports are always forced to beach elevation (1) for ship access
    const elevation: Elevation = hasPort ? 1 : (islandElevations.get(key) ?? 0);

    const biome = getBiome(elevation);

    const cell: MapCell = { hex: h, terrain, hasPort, elevation, region: hexRegions.get(key)! };
    if (biome) {
      cell.biome = biome;
    }
    if (hasPort) {
      cell.market = generatePortMarket(rng);
      cell.nation = portNations.get(key);
      cell.portName = portNames.get(key);
      cell.hasShipyard = portShipyards.get(key);
      cell.dockingHex = portDockingHexes.get(key);
    }

    // Generate decorations for island hexes (based on elevation/biome)
    const pierRotation = hasPort ? calculatePierDirection(h, portDockingHexes.get(key) ?? null, wrap) : 0;
    const decorations = generateDecorations(terrain, hasPort, rng, pierRotation, elevation, biome);
    if (decorations.length > 0) {
      cell.decorations = decorations;
    }

    return cell;
  });

  return { cells, regions: buildRegionTable(cells, wrap, rng) };
}
