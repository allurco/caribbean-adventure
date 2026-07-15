import { describe, it, expect } from "vitest";
import { hex } from "./hex";
import type { CaribbeanState, MapCell, NPCShip, Mission } from "./types";
import {
  generateMission,
  canAffordTavern,
  getTavernCost,
  checkDeliveryMission,
  checkEscortMission,
  checkAssassinationMission,
  failEscortMission,
  completeMission,
} from "./missions";
import { SHIP_SPECS } from "./constants";

function createTestPort(name: string, nation: "England" | "France" | "Spain" | "Netherlands"): MapCell {
  return {
    hex: hex(0, 0),
    terrain: "island", elevation: 2,
    hasPort: true,
    portName: name,
    nation,
    market: {
      inDemandGood: null, prices: {
        Wood: { buy: 5, sell: 3 },
        Sugar: { buy: 8, sell: 6 },
        Rum: { buy: 10, sell: 8 },
        Spice: { buy: 12, sell: 10 },
      },
    },
  };
}

function createTestState(): CaribbeanState {
  const cells: MapCell[] = [
    { ...createTestPort("Port Royal", "England"), hex: hex(0, 0) },
    { ...createTestPort("Havana", "Spain"), hex: hex(5, 0) },
    { ...createTestPort("Nassau", "England"), hex: hex(-5, 5) },
    { hex: hex(1, 0), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(2, 0), terrain: "water", elevation: 0, hasPort: false },
  ];

  return {
    cells,
    ships: {},
    npcs: {},
    mapSize: "small",
    captainDeck: [],
    draftHands: {},
    floatingLoot: [],
    npcIdCounter: 0,
  };
}

function createTestNPC(id: string, role: "MERCHANT" | "FLOTILLA" = "MERCHANT"): NPCShip {
  return {
    id,
    position: hex(3, 0),
    cargo: { Wood: 2, Sugar: 1, Rum: 0, Spice: 0 },
    gold: 30,
    shipClass: "Flute",
    stats: { ...SHIP_SPECS.Flute },
    damage: { hull: 0, crew: 0, masts: 0 },
    nation: "Spain",
    aiBehavior: "MERCHANT_ROUTE",
    destinationPortHex: hex(5, 0),
    spawnPortHex: hex(0, 0),
    isIdentified: false,
    bounty: 25,
    role,
    huntingTargetId: null,
  };
}

describe("canAffordTavern", () => {
  it("returns true when player has enough gold", () => {
    expect(canAffordTavern(10)).toBe(true);
    expect(canAffordTavern(5)).toBe(true);
  });

  it("returns false when player lacks gold", () => {
    expect(canAffordTavern(4)).toBe(false);
    expect(canAffordTavern(0)).toBe(false);
  });
});

describe("getTavernCost", () => {
  it("returns the tavern cost", () => {
    expect(getTavernCost()).toBe(5);
  });
});

describe("generateMission", () => {
  it("generates a delivery mission", () => {
    const G = createTestState();
    // Force delivery mission with low rng
    const mission = generateMission("Port Royal", G, () => 0.1);

    expect(mission).not.toBeNull();
    expect(mission!.type).toBe("DELIVERY");
    expect(mission!.status).toBe("ACTIVE");
    expect(mission!.targetPortName).toBeDefined();
    expect(mission!.targetPortName).not.toBe("Port Royal");
    expect(mission!.reward.gold).toBe(20);
    expect(mission!.reward.glory).toBe(1);
  });

  it("generates an assassination mission", () => {
    const G = createTestState();
    G.npcs["npc-1"] = createTestNPC("npc-1");

    // Force assassination mission with mid rng
    const mission = generateMission("Port Royal", G, () => 0.5);

    expect(mission).not.toBeNull();
    expect(mission!.type).toBe("ASSASSINATION");
    expect(mission!.status).toBe("ACTIVE");
    expect(mission!.reward.gold).toBe(30);
    expect(mission!.reward.glory).toBe(1);
  });

  it("generates an escort mission", () => {
    const G = createTestState();
    // Force escort mission with high rng
    const mission = generateMission("Port Royal", G, () => 0.8);

    expect(mission).not.toBeNull();
    expect(mission!.type).toBe("ESCORT");
    expect(mission!.status).toBe("ACTIVE");
    expect(mission!.noDamageTaken).toBe(true);
    expect(mission!.targetPortName).toBeDefined();
    expect(mission!.reward.gold).toBe(25);
    expect(mission!.reward.glory).toBe(2);
  });

  it("generates generic assassination if no NPCs exist", () => {
    const G = createTestState();
    // No NPCs in state

    const mission = generateMission("Port Royal", G, () => 0.5);

    expect(mission).not.toBeNull();
    expect(mission!.type).toBe("ASSASSINATION");
    expect(mission!.targetNpcId).toBeUndefined(); // Generic bounty
  });
});

describe("checkDeliveryMission", () => {
  it("returns true when at target port", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Delivery",
      description: "Deliver to Havana",
      type: "DELIVERY",
      targetPortName: "Havana",
      reward: { gold: 20, glory: 1 },
      status: "ACTIVE",
    };

    expect(checkDeliveryMission(mission, "Havana")).toBe(true);
  });

  it("returns false when at wrong port", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Delivery",
      description: "Deliver to Havana",
      type: "DELIVERY",
      targetPortName: "Havana",
      reward: { gold: 20, glory: 1 },
      status: "ACTIVE",
    };

    expect(checkDeliveryMission(mission, "Port Royal")).toBe(false);
  });

  it("returns false for non-delivery missions", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Assassination",
      description: "Sink a ship",
      type: "ASSASSINATION",
      targetNpcId: "npc-1",
      reward: { gold: 30, glory: 1 },
      status: "ACTIVE",
    };

    expect(checkDeliveryMission(mission, "Havana")).toBe(false);
  });
});

describe("checkEscortMission", () => {
  it("returns true when at target port with no damage", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Escort",
      description: "Travel safely",
      type: "ESCORT",
      targetPortName: "Havana",
      reward: { gold: 25, glory: 2 },
      status: "ACTIVE",
      noDamageTaken: true,
    };

    expect(checkEscortMission(mission, "Havana")).toBe(true);
  });

  it("returns false when damage was taken", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Escort",
      description: "Travel safely",
      type: "ESCORT",
      targetPortName: "Havana",
      reward: { gold: 25, glory: 2 },
      status: "ACTIVE",
      noDamageTaken: false,
    };

    expect(checkEscortMission(mission, "Havana")).toBe(false);
  });
});

describe("checkAssassinationMission", () => {
  it("returns true when sinking target NPC", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Bounty",
      description: "Sink the ship",
      type: "ASSASSINATION",
      targetNpcId: "npc-1",
      reward: { gold: 30, glory: 1 },
      status: "ACTIVE",
    };

    const npc = createTestNPC("npc-1");
    expect(checkAssassinationMission(mission, "npc-1", npc)).toBe(true);
  });

  it("returns false when sinking wrong NPC", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Bounty",
      description: "Sink the ship",
      type: "ASSASSINATION",
      targetNpcId: "npc-1",
      reward: { gold: 30, glory: 1 },
      status: "ACTIVE",
    };

    const npc = createTestNPC("npc-2");
    expect(checkAssassinationMission(mission, "npc-2", npc)).toBe(false);
  });

  it("returns true for generic assassination when sinking any merchant", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Bounty",
      description: "Sink any merchant",
      type: "ASSASSINATION",
      targetNpcId: undefined, // Generic
      reward: { gold: 30, glory: 1 },
      status: "ACTIVE",
    };

    const npc = createTestNPC("npc-5");
    expect(checkAssassinationMission(mission, "npc-5", npc)).toBe(true);
  });

  it("returns false for generic assassination when sinking flotilla", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Bounty",
      description: "Sink any merchant",
      type: "ASSASSINATION",
      targetNpcId: undefined,
      reward: { gold: 30, glory: 1 },
      status: "ACTIVE",
    };

    const npc = createTestNPC("flotilla-1", "FLOTILLA");
    expect(checkAssassinationMission(mission, "flotilla-1", npc)).toBe(false);
  });
});

describe("failEscortMission", () => {
  it("sets noDamageTaken to false for escort missions", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Escort",
      description: "Travel safely",
      type: "ESCORT",
      targetPortName: "Havana",
      reward: { gold: 25, glory: 2 },
      status: "ACTIVE",
      noDamageTaken: true,
    };

    failEscortMission(mission);
    expect(mission.noDamageTaken).toBe(false);
  });

  it("does nothing for non-escort missions", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test Delivery",
      description: "Deliver cargo",
      type: "DELIVERY",
      targetPortName: "Havana",
      reward: { gold: 20, glory: 1 },
      status: "ACTIVE",
    };

    failEscortMission(mission);
    expect(mission.noDamageTaken).toBeUndefined();
  });
});

describe("completeMission", () => {
  it("sets status to COMPLETED", () => {
    const mission: Mission = {
      id: "test-1",
      title: "Test",
      description: "Test mission",
      type: "DELIVERY",
      targetPortName: "Havana",
      reward: { gold: 20, glory: 1 },
      status: "ACTIVE",
    };

    completeMission(mission);
    expect(mission.status).toBe("COMPLETED");
  });
});
