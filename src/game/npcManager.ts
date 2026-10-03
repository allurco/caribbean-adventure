import { hexEquals, canonicalHex, wrappedNeighbors } from "./hex";
import type { Hex, MapWrap } from "./hex";
import type {
  CaribbeanState,
  MapCell,
  NPCShip,
  ShipClass,
  Nation,
  GoodType,
} from "./types";
import { GOOD_TYPES } from "./types";
import { SHIP_SPECS } from "./constants";

const MERCHANT_SHIP_CLASSES: ShipClass[] = ["Flute", "Galleon"];
const BASE_BOUNTY = 20;

export function getPortCells(cells: MapCell[]): MapCell[] {
  return cells.filter((c) => c.hasPort);
}

function getCellAt(cells: MapCell[], h: Hex): MapCell | undefined {
  return cells.find((c) => hexEquals(c.hex, h));
}

function isWalkable(
  cell: MapCell | undefined,
  destination: Hex,
  playerShips: Record<string, { position: Hex }>,
  npcs: Record<string, { position: Hex }>
): boolean {
  if (!cell) return false;

  // Water is always walkable
  if (cell.terrain === "water") {
    // Check for player ships
    const hasPlayer = Object.values(playerShips).some((s) =>
      hexEquals(s.position, cell.hex)
    );
    if (hasPlayer) return false;

    // Check for other NPCs
    const hasNPC = Object.values(npcs).some((n) =>
      hexEquals(n.position, cell.hex)
    );
    if (hasNPC) return false;

    return true;
  }

  // Island with port is walkable only as destination
  if (cell.terrain === "island" && cell.hasPort) {
    return hexEquals(cell.hex, destination);
  }

  // Plain island is not walkable
  return false;
}

/**
 * Breadth-first shortest path from `start` to `end` over wrapped neighbours, so on a
 * wrapped map it crosses the seam whenever that is shorter. Every hex in the returned
 * path is canonical.
 */
export function findPath(
  start: Hex,
  end: Hex,
  cells: MapCell[],
  playerShips: Record<string, { position: Hex }>,
  npcs: Record<string, { position: Hex }>,
  wrap: MapWrap
): Hex[] {
  start = canonicalHex(start, wrap);
  end = canonicalHex(end, wrap);

  // BFS pathfinding
  const startCell = getCellAt(cells, start);
  const endCell = getCellAt(cells, end);

  if (!startCell || !endCell) return [];

  // If start equals end, return single-element path
  if (hexEquals(start, end)) {
    return [start];
  }

  const visited = new Set<string>();
  const queue: { hex: Hex; path: Hex[] }[] = [{ hex: start, path: [start] }];
  const hexKey = (h: Hex) => `${h.q},${h.r}`;

  visited.add(hexKey(start));

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const neighbor of wrappedNeighbors(current.hex, wrap)) {
      const key = hexKey(neighbor);
      if (visited.has(key)) continue;

      const neighborCell = getCellAt(cells, neighbor);

      // Check if this neighbor is walkable
      // For the destination, we allow ports
      const isEnd = hexEquals(neighbor, end);

      if (isEnd && neighborCell?.hasPort) {
        // Reached destination port
        return [...current.path, neighbor];
      }

      if (isWalkable(neighborCell, end, playerShips, npcs)) {
        visited.add(key);
        const newPath = [...current.path, neighbor];

        if (isEnd) {
          return newPath;
        }

        queue.push({ hex: neighbor, path: newPath });
      }
    }
  }

  // No path found
  return [];
}

function generateRandomCargo(
  maxCargo: number,
  rng: () => number
): Record<GoodType, number> {
  const cargo: Record<GoodType, number> = {
    Wood: 0,
    Sugar: 0,
    Rum: 0,
    Spice: 0,
  };

  let remaining = Math.floor(maxCargo * (0.5 + rng() * 0.5)); // 50-100% full

  while (remaining > 0) {
    const goodIndex = Math.floor(rng() * GOOD_TYPES.length);
    const good = GOOD_TYPES[goodIndex];
    const amount = Math.min(remaining, 1 + Math.floor(rng() * 2));
    cargo[good] += amount;
    remaining -= amount;
  }

  return cargo;
}

export function createNPCShip(
  id: string,
  spawnHex: Hex,
  destinationHex: Hex,
  nation: Nation,
  shipClass: ShipClass,
  rng: () => number
): NPCShip {
  const stats = structuredClone(SHIP_SPECS[shipClass]);
  const cargo = generateRandomCargo(stats.cargo, rng);
  const gold = Math.floor(10 + rng() * 40); // 10-50 gold
  const bounty = BASE_BOUNTY + Math.floor(rng() * 30); // 20-50 bounty

  return {
    id,
    position: { ...spawnHex },
    cargo,
    gold,
    shipClass,
    stats,
    damage: { hull: 0, crew: 0, masts: 0 },
    nation,
    aiBehavior: "MERCHANT_ROUTE",
    destinationPortHex: { ...destinationHex },
    spawnPortHex: { ...spawnHex },
    isIdentified: false,
    bounty,
    role: "MERCHANT" as const,
    huntingTargetId: null,
  };
}

/**
 * Create a flotilla warship that hunts a specific player.
 * Flotillas are aggressive NPCs that move toward and attack players with bounties.
 */
export function createFlotillaShip(
  id: string,
  spawnHex: Hex,
  nation: Nation,
  shipClass: ShipClass,
  targetPlayerId: string
): NPCShip {
  const stats = structuredClone(SHIP_SPECS[shipClass]);

  return {
    id,
    position: { ...spawnHex },
    cargo: { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 },
    gold: 0, // Military ships don't carry trade goods
    shipClass,
    stats,
    damage: { hull: 0, crew: 0, masts: 0 },
    nation,
    aiBehavior: "HUNTER",
    destinationPortHex: { ...spawnHex }, // Not used for hunters
    spawnPortHex: { ...spawnHex },
    isIdentified: true, // Flotillas are always identified (military ships)
    bounty: 0, // No bounty for attacking military ships
    role: "FLOTILLA" as const,
    huntingTargetId: targetPlayerId,
  };
}

export function spawnMerchant(
  G: CaribbeanState,
  rng: () => number
): string | null {
  // Only spawn from non-Pirate ports (Pirate havens don't have merchants)
  const ports = getPortCells(G.cells).filter(
    (p) => p.nation && p.nation !== "Pirate"
  );

  if (ports.length < 2) {
    return null;
  }

  // Pick random spawn port
  const spawnIndex = Math.floor(rng() * ports.length);
  const spawnPort = ports[spawnIndex];

  // Pick random destination port (different from spawn)
  let destIndex = Math.floor(rng() * (ports.length - 1));
  if (destIndex >= spawnIndex) destIndex++;
  const destPort = ports[destIndex];

  // Pick random merchant ship class
  const shipClass =
    MERCHANT_SHIP_CLASSES[Math.floor(rng() * MERCHANT_SHIP_CLASSES.length)];

  // Generate ID
  G.npcIdCounter++;
  const id = `npc-${G.npcIdCounter}`;

  // Create the NPC - nation is guaranteed to be a valid Nation (not Pirate)
  const npc = createNPCShip(
    id,
    spawnPort.hex,
    destPort.hex,
    spawnPort.nation as Nation,
    shipClass,
    rng
  );

  G.npcs[id] = npc;

  return id;
}

export function shouldDespawn(npc: NPCShip): boolean {
  return hexEquals(npc.position, npc.destinationPortHex);
}

export function despawnNPC(G: CaribbeanState, npcId: string): void {
  delete G.npcs[npcId];
}

export function moveNPC(G: CaribbeanState, npcId: string): boolean {
  const npc = G.npcs[npcId];
  if (!npc) return false;

  // Determine destination based on AI behavior
  let destination: Hex;

  if (npc.aiBehavior === "HUNTER" && npc.huntingTargetId) {
    // Flotilla hunters move toward their target player
    const targetShip = G.ships[npc.huntingTargetId];
    if (!targetShip) {
      // Target no longer exists - stay put
      return false;
    }
    destination = targetShip.position;
  } else {
    // Merchants move toward their destination port
    destination = npc.destinationPortHex;
  }

  // Find path to destination
  const path = findPath(
    npc.position,
    destination,
    G.cells,
    G.ships as Record<string, { position: Hex }>,
    G.npcs as Record<string, { position: Hex }>,
    G.wrap
  );

  if (path.length <= 1) {
    // No path or already at destination
    return false;
  }

  // Move up to maneuverability steps along the path
  const maxMoves = npc.stats.maneuverability;
  const stepsToMove = Math.min(maxMoves, path.length - 1);

  if (stepsToMove > 0) {
    npc.position = { ...path[stepsToMove] };
    return true;
  }

  return false;
}

export function moveAllNPCs(G: CaribbeanState): void {
  const npcIds = Object.keys(G.npcs);

  for (const npcId of npcIds) {
    const npc = G.npcs[npcId];
    if (!npc) continue;

    // Flotillas never despawn - they hunt until destroyed
    if (npc.role === "FLOTILLA") {
      moveNPC(G, npcId);
      continue;
    }

    // Merchants: Check if should despawn first (already at destination)
    if (shouldDespawn(npc)) {
      despawnNPC(G, npcId);
      continue;
    }

    // Move the NPC
    moveNPC(G, npcId);

    // Check if reached destination after moving
    if (shouldDespawn(G.npcs[npcId])) {
      despawnNPC(G, npcId);
    }
  }
}
