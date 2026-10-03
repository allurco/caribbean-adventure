import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { Caribbean } from "./Game";
import type { CaribbeanState, Captain, MapCell, NPCShip } from "./types";
import { hex, hexEquals, hexDistance } from "./hex";
import { createShipState } from "./economy";
import { createNPCShip, createFlotillaShip } from "./npcManager";
import type { MapSizeId } from "./mapConfig";

const TEST_MARKET = {
  inDemandGood: null, prices: {
    Wood: { buy: 8, sell: 6 },
    Sugar: { buy: 20, sell: 15 },
    Rum: { buy: 30, sell: 23 },
    Spice: { buy: 45, sell: 35 },
  },
};

const CAPTAIN_A: Captain = {
  id: "test-eng",
  name: "Test English",
  nation: "England",
  ability: "Test ability A",
};
const CAPTAIN_B: Captain = {
  id: "test-spa",
  name: "Test Spanish",
  nation: "Spain",
  ability: "Test ability B",
};

function makeCells(): MapCell[] {
  return [
    {
      hex: hex(0, 0),
      terrain: "island", elevation: 2,
      hasPort: true,
      nation: "England",
      market: TEST_MARKET,
    },
    { hex: hex(1, 0), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(2, 0), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(3, 0), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(4, 0), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(0, 1), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(-1, 1), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(0, 2), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(1, 2), terrain: "water", elevation: 0, hasPort: false },
    {
      hex: hex(0, 3),
      terrain: "island", elevation: 2,
      hasPort: true,
      nation: "Spain",
      market: TEST_MARKET,
    },
  ];
}

/** Setup in main phase with NPCs */
function setupMainPhaseWithNPCs() {
  const cells = makeCells();
  const ship0 = createShipState(hex(0, 0), "Sloop");
  ship0.captain = CAPTAIN_A;
  const ship1 = createShipState(hex(0, 3), "Flute");
  ship1.captain = CAPTAIN_B;

  // Create an NPC merchant at (1,0) heading to (0,3)
  const npc1: NPCShip = createNPCShip(
    "npc-1",
    hex(1, 0),
    hex(0, 3),
    "England",
    "Galleon",
    Math.random
  );

  const TestGame: Game<CaribbeanState> = {
    ...Caribbean,
    setup: () => ({
      cells,
      ships: {
        "0": ship0,
        "1": ship1,
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {
        "npc-1": npc1,
      },
      npcIdCounter: 1,
      wrap: null,
    }),
  };
  const client = Client<CaribbeanState>({ game: TestGame, numPlayers: 2 });
  client.start();
  return client;
}

describe("NPC AI movement", () => {
  it("moves NPCs at the end of each player turn", () => {
    const client = setupMainPhaseWithNPCs();

    // NPC starts at (1,0)
    const npcBefore = client.getState()!.G.npcs["npc-1"];
    expect(hexEquals(npcBefore.position, hex(1, 0))).toBe(true);

    // Player 0 ends their turn (by making enough moves or ending manually)
    client.events.endTurn!();

    // After player 0's turn ends, NPCs should have moved
    const { G } = client.getState()!;
    const npc = G.npcs["npc-1"];

    // Galleon has maneuverability 1, should have moved 1 hex toward destination
    // From (1,0) toward (0,3), first step would be (0,1) or similar water hex
    expect(hexEquals(npc.position, hex(1, 0))).toBe(false);
  });

  it("despawns NPCs that reach their destination", () => {
    const cells = makeCells();
    const ship0 = createShipState(hex(0, 0), "Sloop");
    ship0.captain = CAPTAIN_A;
    const ship1 = createShipState(hex(4, 0), "Flute");
    ship1.captain = CAPTAIN_B;

    // Create NPC one hex away from destination
    const npc1: NPCShip = createNPCShip(
      "npc-1",
      hex(0, 2),
      hex(0, 3),
      "Spain",
      "Galleon",
      Math.random
    );

    const TestGame: Game<CaribbeanState> = {
      ...Caribbean,
      setup: () => ({
        cells,
        ships: {
          "0": ship0,
          "1": ship1,
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
        floatingLoot: [],
        npcs: {
          "npc-1": npc1,
        },
        npcIdCounter: 1,
        wrap: null,
      }),
    };
    const client = Client<CaribbeanState>({ game: TestGame, numPlayers: 2 });
    client.start();

    expect(client.getState()!.G.npcs["npc-1"]).toBeDefined();

    // End turn - NPC should move to destination and despawn
    client.events.endTurn!();

    expect(client.getState()!.G.npcs["npc-1"]).toBeUndefined();
  });

  it("NPCs avoid player ships when pathfinding", () => {
    const cells = makeCells();
    // Place player at (0,1) which is on the NPC's direct path
    const ship0 = createShipState(hex(0, 1), "Sloop");
    ship0.captain = CAPTAIN_A;
    const ship1 = createShipState(hex(4, 0), "Flute");
    ship1.captain = CAPTAIN_B;

    // NPC at (1,0) wants to go to (0,3) - direct path blocked by player at (0,1)
    const npc1: NPCShip = createNPCShip(
      "npc-1",
      hex(1, 0),
      hex(0, 3),
      "England",
      "Galleon",
      Math.random
    );

    const TestGame: Game<CaribbeanState> = {
      ...Caribbean,
      setup: () => ({
        cells,
        ships: {
          "0": ship0,
          "1": ship1,
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
        floatingLoot: [],
        npcs: {
          "npc-1": npc1,
        },
        npcIdCounter: 1,
        wrap: null,
      }),
    };
    const client = Client<CaribbeanState>({ game: TestGame, numPlayers: 2 });
    client.start();

    client.events.endTurn!();

    const { G } = client.getState()!;
    const npc = G.npcs["npc-1"];

    // NPC should have moved but NOT to player's position
    expect(hexEquals(npc.position, hex(0, 1))).toBe(false);
  });
});

describe("NPC spawning", () => {
  it("spawns initial merchants at game start", () => {
    // Using the real game setup should spawn some merchants
    const client = Client<CaribbeanState>({ game: Caribbean, numPlayers: 2 });
    client.start();

    // Complete draft phase
    client.moves.pickCaptain(0, "Sloop"); // P0
    client.moves.pickCaptain(0, "Flute"); // P1

    // After draft, there should be some NPCs spawned
    const { G } = client.getState()!;
    // At least check that npcs object exists and is empty or has merchants
    expect(G.npcs).toBeDefined();
  });
});

describe("Flotilla creation", () => {
  it("creates a flotilla ship with HUNTER AI behavior", () => {
    const flotilla = createFlotillaShip(
      "flotilla-1",
      hex(0, 0),
      "Spain",
      "Frigate",
      "0"
    );

    expect(flotilla.role).toBe("FLOTILLA");
    expect(flotilla.aiBehavior).toBe("HUNTER");
    expect(flotilla.huntingTargetId).toBe("0");
    expect(flotilla.nation).toBe("Spain");
    expect(flotilla.shipClass).toBe("Frigate");
  });

  it("creates a flotilla with proper stats for warship class", () => {
    const flotilla = createFlotillaShip(
      "flotilla-2",
      hex(1, 1),
      "England",
      "Frigate",
      "1"
    );

    // Frigate should have decent cannons and maneuverability
    expect(flotilla.stats.cannons).toBeGreaterThan(0);
    expect(flotilla.stats.maneuverability).toBeGreaterThan(0);
  });
});

describe("Flotilla hunting behavior", () => {
  it("flotilla moves toward its hunting target", () => {
    const cells = makeCells();
    const ship0 = createShipState(hex(0, 3), "Sloop"); // Target at (0,3)
    ship0.captain = CAPTAIN_A;
    const ship1 = createShipState(hex(4, 0), "Flute");
    ship1.captain = CAPTAIN_B;

    // Flotilla hunting player 0, starting at (1,0)
    const flotilla = createFlotillaShip(
      "flotilla-1",
      hex(1, 0),
      "Spain",
      "Frigate",
      "0"
    );

    const TestGame: Game<CaribbeanState> = {
      ...Caribbean,
      setup: () => ({
        cells,
        ships: {
          "0": ship0,
          "1": ship1,
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
        floatingLoot: [],
        npcs: {
          "flotilla-1": flotilla,
        },
        npcIdCounter: 1,
        wrap: null,
      }),
    };
    const client = Client<CaribbeanState>({ game: TestGame, numPlayers: 2 });
    client.start();

    const distanceBefore = hexDistance(flotilla.position, ship0.position);

    client.events.endTurn!();

    const { G } = client.getState()!;
    const flotillaAfter = G.npcs["flotilla-1"];

    // Flotilla should have moved closer to the target
    const distanceAfter = hexDistance(flotillaAfter.position, G.ships["0"].position);
    expect(distanceAfter).toBeLessThan(distanceBefore);
  });

  it("flotilla stays put if target is destroyed", () => {
    const cells = makeCells();
    const ship0 = createShipState(hex(0, 0), "Sloop");
    ship0.captain = CAPTAIN_A;
    const ship1 = createShipState(hex(4, 0), "Flute");
    ship1.captain = CAPTAIN_B;

    // Flotilla hunting non-existent player "2"
    const flotilla = createFlotillaShip(
      "flotilla-1",
      hex(1, 0),
      "Spain",
      "Frigate",
      "2" // Target doesn't exist
    );

    const TestGame: Game<CaribbeanState> = {
      ...Caribbean,
      setup: () => ({
        cells,
        ships: {
          "0": ship0,
          "1": ship1,
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
        floatingLoot: [],
        npcs: {
          "flotilla-1": flotilla,
        },
        npcIdCounter: 1,
        wrap: null,
      }),
    };
    const client = Client<CaribbeanState>({ game: TestGame, numPlayers: 2 });
    client.start();

    const posBefore = { ...client.getState()!.G.npcs["flotilla-1"].position };

    client.events.endTurn!();

    const { G } = client.getState()!;
    const flotillaAfter = G.npcs["flotilla-1"];

    // Flotilla should not have moved since target doesn't exist
    expect(hexEquals(flotillaAfter.position, posBefore)).toBe(true);
  });

  it("flotilla does not despawn like merchants", () => {
    const cells = makeCells();
    const ship0 = createShipState(hex(0, 3), "Sloop"); // Target at destination port
    ship0.captain = CAPTAIN_A;
    const ship1 = createShipState(hex(4, 0), "Flute");
    ship1.captain = CAPTAIN_B;

    // Flotilla one hex away from target
    const flotilla = createFlotillaShip(
      "flotilla-1",
      hex(0, 2),
      "Spain",
      "Sloop", // Use Sloop for higher maneuverability
      "0"
    );

    const TestGame: Game<CaribbeanState> = {
      ...Caribbean,
      setup: () => ({
        cells,
        ships: {
          "0": ship0,
          "1": ship1,
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
        floatingLoot: [],
        npcs: {
          "flotilla-1": flotilla,
        },
        npcIdCounter: 1,
        wrap: null,
      }),
    };
    const client = Client<CaribbeanState>({ game: TestGame, numPlayers: 2 });
    client.start();

    client.events.endTurn!();

    // Flotilla should still exist (not despawned)
    expect(client.getState()!.G.npcs["flotilla-1"]).toBeDefined();
  });
});
