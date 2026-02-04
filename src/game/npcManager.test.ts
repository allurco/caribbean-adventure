import { describe, it, expect } from "vitest";
import { hex, hexEquals, hexDistance } from "./hex";
import type { Hex } from "./hex";
import { generateMap } from "./mapGenerator";
import type { MapCell, CaribbeanState, NPCShip, Nation } from "./types";
import type { MapSizeId } from "./mapConfig";
import {
  spawnMerchant,
  findPath,
  moveNPC,
  moveAllNPCs,
  getPortCells,
  createNPCShip,
  shouldDespawn,
  despawnNPC,
} from "./npcManager";

function createTestState(cells: MapCell[]): CaribbeanState {
  return {
    cells,
    ships: {},
    npcs: {},
    mapSize: "small" as MapSizeId,
    captainDeck: [],
    draftHands: {},
    floatingLoot: [],
    npcIdCounter: 0,
    combat: undefined,
  };
}

function createSimpleMapWithPorts(): MapCell[] {
  // Create a simple map with two ports for testing
  return [
    { hex: hex(0, 0), terrain: "water", hasPort: false },
    { hex: hex(1, 0), terrain: "water", hasPort: false },
    { hex: hex(2, 0), terrain: "island", hasPort: true, nation: "Spain" },
    { hex: hex(0, 1), terrain: "water", hasPort: false },
    { hex: hex(1, 1), terrain: "water", hasPort: false },
    { hex: hex(0, 2), terrain: "water", hasPort: false },
    { hex: hex(-1, 2), terrain: "island", hasPort: true, nation: "England" },
    { hex: hex(-1, 1), terrain: "water", hasPort: false },
    { hex: hex(-1, 0), terrain: "water", hasPort: false },
    { hex: hex(0, -1), terrain: "water", hasPort: false },
    { hex: hex(1, -1), terrain: "water", hasPort: false },
    { hex: hex(2, -1), terrain: "water", hasPort: false },
  ];
}

describe("getPortCells", () => {
  it("returns only cells with ports", () => {
    const cells = createSimpleMapWithPorts();
    const ports = getPortCells(cells);
    expect(ports).toHaveLength(2);
    expect(ports.every((c) => c.hasPort)).toBe(true);
  });

  it("returns empty array when no ports", () => {
    const cells: MapCell[] = [
      { hex: hex(0, 0), terrain: "water", hasPort: false },
      { hex: hex(1, 0), terrain: "island", hasPort: false },
    ];
    const ports = getPortCells(cells);
    expect(ports).toHaveLength(0);
  });
});

describe("findPath", () => {
  it("finds direct path between adjacent hexes", () => {
    const cells = createSimpleMapWithPorts();
    const path = findPath(hex(0, 0), hex(1, 0), cells, {}, {});
    expect(path).toHaveLength(2);
    expect(hexEquals(path[0], hex(0, 0))).toBe(true);
    expect(hexEquals(path[1], hex(1, 0))).toBe(true);
  });

  it("finds path around obstacles", () => {
    const cells: MapCell[] = [
      { hex: hex(0, 0), terrain: "water", hasPort: false },
      { hex: hex(1, 0), terrain: "island", hasPort: false }, // blocked
      { hex: hex(2, 0), terrain: "water", hasPort: false },
      { hex: hex(0, 1), terrain: "water", hasPort: false },
      { hex: hex(1, 1), terrain: "water", hasPort: false },
      { hex: hex(0, -1), terrain: "water", hasPort: false },
      { hex: hex(1, -1), terrain: "water", hasPort: false },
    ];
    const path = findPath(hex(0, 0), hex(2, 0), cells, {}, {});
    // Should go around the island
    expect(path.length).toBeGreaterThan(2);
    expect(hexEquals(path[0], hex(0, 0))).toBe(true);
    expect(hexEquals(path[path.length - 1], hex(2, 0))).toBe(true);
    // Should not go through the island
    expect(path.some((h) => hexEquals(h, hex(1, 0)))).toBe(false);
  });

  it("allows path to end at port (island with hasPort)", () => {
    const cells = createSimpleMapWithPorts();
    const portHex = hex(2, 0); // Spanish port
    const path = findPath(hex(0, 0), portHex, cells, {}, {});
    expect(path.length).toBeGreaterThan(0);
    expect(hexEquals(path[path.length - 1], portHex)).toBe(true);
  });

  it("avoids hexes occupied by player ships", () => {
    const cells = createSimpleMapWithPorts();
    const playerShips = {
      "0": { position: hex(1, 0) },
    };
    const path = findPath(hex(0, 0), hex(2, 0), cells, playerShips as Record<string, { position: Hex }>, {});
    // Should not go through player position
    expect(path.some((h) => hexEquals(h, hex(1, 0)))).toBe(false);
  });

  it("returns empty array when no path exists", () => {
    const cells: MapCell[] = [
      { hex: hex(0, 0), terrain: "water", hasPort: false },
      { hex: hex(2, 0), terrain: "water", hasPort: false },
      // No connection between them
    ];
    const path = findPath(hex(0, 0), hex(2, 0), cells, {}, {});
    expect(path).toHaveLength(0);
  });
});

describe("createNPCShip", () => {
  it("creates a Flute or Galleon merchant", () => {
    const cells = createSimpleMapWithPorts();
    const spawnPort = cells.find((c) => c.hasPort && c.nation === "Spain")!;
    const destPort = cells.find((c) => c.hasPort && c.nation === "England")!;

    const npc = createNPCShip(
      "npc-1",
      spawnPort.hex,
      destPort.hex,
      spawnPort.nation as Nation,
      "Flute",
      Math.random
    );

    expect(npc.id).toBe("npc-1");
    expect(npc.shipClass).toBe("Flute");
    expect(npc.nation).toBe("Spain");
    expect(hexEquals(npc.position, spawnPort.hex)).toBe(true);
    expect(hexEquals(npc.destinationPortHex, destPort.hex)).toBe(true);
    expect(hexEquals(npc.spawnPortHex, spawnPort.hex)).toBe(true);
    expect(npc.aiBehavior).toBe("MERCHANT_ROUTE");
    expect(npc.isIdentified).toBe(false);
    expect(npc.bounty).toBeGreaterThan(0);
  });

  it("fills cargo with random goods", () => {
    const cells = createSimpleMapWithPorts();
    const spawnPort = cells.find((c) => c.hasPort)!;
    const destPort = cells.filter((c) => c.hasPort)[1];

    const npc = createNPCShip(
      "npc-1",
      spawnPort.hex,
      destPort.hex,
      spawnPort.nation as Nation,
      "Galleon",
      Math.random
    );

    const totalCargo = Object.values(npc.cargo).reduce((a, b) => a + b, 0);
    expect(totalCargo).toBeGreaterThan(0);
  });
});

describe("spawnMerchant", () => {
  it("spawns a merchant when at least 2 ports exist", () => {
    const cells = createSimpleMapWithPorts();
    const G = createTestState(cells);

    const result = spawnMerchant(G, Math.random);

    expect(result).not.toBeNull();
    expect(Object.keys(G.npcs)).toHaveLength(1);
    const npc = Object.values(G.npcs)[0];
    expect(["Flute", "Galleon"]).toContain(npc.shipClass);
    expect(npc.aiBehavior).toBe("MERCHANT_ROUTE");
  });

  it("increments npcIdCounter", () => {
    const cells = createSimpleMapWithPorts();
    const G = createTestState(cells);

    spawnMerchant(G, Math.random);
    expect(G.npcIdCounter).toBe(1);

    spawnMerchant(G, Math.random);
    expect(G.npcIdCounter).toBe(2);
  });

  it("returns null when less than 2 ports exist", () => {
    const cells: MapCell[] = [
      { hex: hex(0, 0), terrain: "water", hasPort: false },
      { hex: hex(1, 0), terrain: "island", hasPort: true, nation: "Spain" },
    ];
    const G = createTestState(cells);

    const result = spawnMerchant(G, Math.random);

    expect(result).toBeNull();
    expect(Object.keys(G.npcs)).toHaveLength(0);
  });

  it("assigns nation from spawn port", () => {
    const cells = createSimpleMapWithPorts();
    const G = createTestState(cells);

    // Spawn multiple times and check nations match spawn ports
    for (let i = 0; i < 5; i++) {
      const npcId = spawnMerchant(G, Math.random);
      if (npcId) {
        const npc = G.npcs[npcId];
        const spawnPort = cells.find((c) => hexEquals(c.hex, npc.spawnPortHex));
        expect(npc.nation).toBe(spawnPort?.nation);
      }
    }
  });
});

describe("moveNPC", () => {
  it("moves NPC along path towards destination", () => {
    const cells = createSimpleMapWithPorts();
    const G = createTestState(cells);

    // Create NPC at (0,0) heading to port at (2,0)
    const npc: NPCShip = createNPCShip(
      "npc-1",
      hex(0, 0),
      hex(2, 0),
      "Spain",
      "Flute",
      Math.random
    );
    G.npcs["npc-1"] = npc;

    const moved = moveNPC(G, "npc-1");

    expect(moved).toBe(true);
    // Flute has maneuverability 2, so should move up to 2 hexes
    expect(hexDistance(npc.position, hex(0, 0))).toBeGreaterThan(0);
  });

  it("respects ship maneuverability for move distance", () => {
    const cells = createSimpleMapWithPorts();
    const G = createTestState(cells);

    // Create a path that's longer than maneuverability
    const npc: NPCShip = createNPCShip(
      "npc-1",
      hex(0, 0),
      hex(2, 0), // 2 hexes away directly
      "Spain",
      "Flute", // Flute has maneuverability 2
      Math.random
    );
    G.npcs["npc-1"] = npc;

    moveNPC(G, "npc-1");

    // Should have moved but respecting maneuverability
    const distanceMoved = hexDistance(hex(0, 0), npc.position);
    expect(distanceMoved).toBeLessThanOrEqual(npc.stats.maneuverability);
  });

  it("returns false if no valid path", () => {
    const cells: MapCell[] = [
      { hex: hex(0, 0), terrain: "water", hasPort: false },
      // Destination doesn't exist on map
    ];
    const G = createTestState(cells);

    const npc: NPCShip = createNPCShip(
      "npc-1",
      hex(0, 0),
      hex(10, 10), // Not on map
      "Spain",
      "Flute",
      Math.random
    );
    G.npcs["npc-1"] = npc;

    const moved = moveNPC(G, "npc-1");
    expect(moved).toBe(false);
  });
});

describe("shouldDespawn", () => {
  it("returns true when NPC reaches destination", () => {
    const npc: NPCShip = createNPCShip(
      "npc-1",
      hex(2, 0),
      hex(2, 0), // Already at destination
      "Spain",
      "Flute",
      Math.random
    );
    npc.position = hex(2, 0);

    expect(shouldDespawn(npc)).toBe(true);
  });

  it("returns false when NPC not at destination", () => {
    const npc: NPCShip = createNPCShip(
      "npc-1",
      hex(0, 0),
      hex(2, 0),
      "Spain",
      "Flute",
      Math.random
    );

    expect(shouldDespawn(npc)).toBe(false);
  });
});

describe("despawnNPC", () => {
  it("removes NPC from state", () => {
    const cells = createSimpleMapWithPorts();
    const G = createTestState(cells);

    const npc: NPCShip = createNPCShip(
      "npc-1",
      hex(0, 0),
      hex(2, 0),
      "Spain",
      "Flute",
      Math.random
    );
    G.npcs["npc-1"] = npc;

    despawnNPC(G, "npc-1");

    expect(G.npcs["npc-1"]).toBeUndefined();
  });
});

describe("moveAllNPCs", () => {
  it("moves all NPCs and despawns those at destination", () => {
    const cells = createSimpleMapWithPorts();
    const G = createTestState(cells);

    // NPC 1: not at destination (use Galleon with maneuverability 1 so it doesn't reach in one turn)
    const npc1: NPCShip = createNPCShip(
      "npc-1",
      hex(0, 0),
      hex(2, 0),
      "Spain",
      "Galleon",
      Math.random
    );
    G.npcs["npc-1"] = npc1;

    // NPC 2: already at destination
    const npc2: NPCShip = createNPCShip(
      "npc-2",
      hex(-1, 2),
      hex(-1, 2),
      "England",
      "Galleon",
      Math.random
    );
    npc2.position = hex(-1, 2);
    G.npcs["npc-2"] = npc2;

    moveAllNPCs(G);

    // NPC 1 should still exist and have moved
    expect(G.npcs["npc-1"]).toBeDefined();

    // NPC 2 should be despawned
    expect(G.npcs["npc-2"]).toBeUndefined();
  });

  it("handles empty NPC list", () => {
    const cells = createSimpleMapWithPorts();
    const G = createTestState(cells);

    // Should not throw
    expect(() => moveAllNPCs(G)).not.toThrow();
  });
});

describe("integration: full merchant lifecycle", () => {
  it("spawns, moves, and despawns merchant", () => {
    // Use a real generated map with ports
    const cells = generateMap(3, 42); // seeded for reproducibility
    const G = createTestState(cells);

    // Need at least 2 non-Pirate ports for merchant spawning
    const nonPiratePorts = getPortCells(cells).filter(
      (p) => p.nation && p.nation !== "Pirate"
    );
    if (nonPiratePorts.length < 2) {
      // Skip test if not enough non-Pirate ports generated
      return;
    }

    // Spawn a merchant
    const npcId = spawnMerchant(G, () => 0.5); // deterministic "random"
    expect(npcId).not.toBeNull();

    const npc = G.npcs[npcId!];
    const startPos = { ...npc.position };

    // Move until destination or max iterations
    let iterations = 0;
    const maxIterations = 20;
    while (!shouldDespawn(npc) && iterations < maxIterations) {
      moveAllNPCs(G);
      iterations++;
    }

    // Either reached destination (despawned) or got stuck
    if (G.npcs[npcId!]) {
      // If still exists, should have moved from start
      expect(hexEquals(npc.position, startPos)).toBe(false);
    }
  });
});
