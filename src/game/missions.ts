import { hexDistance } from "./hex";
import type { CaribbeanState, Mission, MissionType, MapCell, NPCShip } from "./types";

const TAVERN_COST = 5;
const MIN_DELIVERY_DISTANCE = 3;

// Mission title templates
const DELIVERY_TITLES = [
  "Urgent Cargo",
  "The Governor's Package",
  "Merchant's Request",
  "Secret Documents",
  "Medical Supplies",
  "Royal Dispatch",
];

const ASSASSINATION_TITLES = [
  "Wanted: Dead or Alive",
  "The Pirate Menace",
  "Bounty Hunt",
  "Clear the Seas",
  "Naval Contract",
  "Letter of Marque",
];

const ESCORT_TITLES = [
  "Safe Passage",
  "The Careful Route",
  "Unmarked Journey",
  "Stealth Run",
  "Ghost Ship",
];

let missionIdCounter = 0;

function generateMissionId(): string {
  missionIdCounter++;
  return `mission-${missionIdCounter}-${Date.now()}`;
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function getPortCells(cells: MapCell[]): MapCell[] {
  return cells.filter((c) => c.hasPort && c.portName);
}

function getDistantPorts(
  currentPortName: string,
  cells: MapCell[],
  minDistance: number
): MapCell[] {
  const ports = getPortCells(cells);
  const currentPort = ports.find((p) => p.portName === currentPortName);
  if (!currentPort) return ports.filter((p) => p.portName !== currentPortName);

  return ports.filter((p) => {
    if (p.portName === currentPortName) return false;
    return hexDistance(currentPort.hex, p.hex) >= minDistance;
  });
}

function generateDeliveryMission(
  currentPortName: string,
  cells: MapCell[],
  rng: () => number
): Mission | null {
  const distantPorts = getDistantPorts(currentPortName, cells, MIN_DELIVERY_DISTANCE);
  if (distantPorts.length === 0) {
    // Fall back to any other port
    const anyOtherPort = getPortCells(cells).filter((p) => p.portName !== currentPortName);
    if (anyOtherPort.length === 0) return null;
    const targetPort = pickRandom(anyOtherPort, rng);
    return createDeliveryMission(targetPort.portName!, rng);
  }

  const targetPort = pickRandom(distantPorts, rng);
  return createDeliveryMission(targetPort.portName!, rng);
}

function createDeliveryMission(targetPortName: string, rng: () => number): Mission {
  return {
    id: generateMissionId(),
    title: pickRandom(DELIVERY_TITLES, rng),
    description: `Deliver a sealed package to ${targetPortName}. The contents are confidential - do not ask questions.`,
    type: "DELIVERY",
    targetPortName,
    reward: { gold: 20, glory: 1 },
    status: "ACTIVE",
  };
}

function generateAssassinationMission(
  npcs: Record<string, NPCShip>,
  rng: () => number
): Mission | null {
  // Find merchant NPCs (not flotillas)
  const merchants = Object.values(npcs).filter(
    (npc) => npc.role === "MERCHANT" && !npc.isDerelict
  );

  if (merchants.length === 0) {
    // No active merchants - create a generic bounty mission
    return {
      id: generateMissionId(),
      title: pickRandom(ASSASSINATION_TITLES, rng),
      description: "Hunt down and sink the next merchant ship you encounter. Any nation's merchant will do.",
      type: "ASSASSINATION",
      targetNpcId: undefined, // Will match any merchant
      reward: { gold: 30, glory: 1 },
      status: "ACTIVE",
    };
  }

  const targetNpc = pickRandom(merchants, rng);
  return {
    id: generateMissionId(),
    title: pickRandom(ASSASSINATION_TITLES, rng),
    description: `A ${targetNpc.nation} merchant ship has been marked for destruction. Sink it and claim your reward.`,
    type: "ASSASSINATION",
    targetNpcId: targetNpc.id,
    reward: { gold: 30, glory: 1 },
    status: "ACTIVE",
  };
}

function generateEscortMission(
  currentPortName: string,
  cells: MapCell[],
  rng: () => number
): Mission | null {
  const distantPorts = getDistantPorts(currentPortName, cells, MIN_DELIVERY_DISTANCE);
  if (distantPorts.length === 0) {
    const anyOtherPort = getPortCells(cells).filter((p) => p.portName !== currentPortName);
    if (anyOtherPort.length === 0) return null;
    const targetPort = pickRandom(anyOtherPort, rng);
    return createEscortMission(targetPort.portName!, rng);
  }

  const targetPort = pickRandom(distantPorts, rng);
  return createEscortMission(targetPort.portName!, rng);
}

function createEscortMission(targetPortName: string, rng: () => number): Mission {
  return {
    id: generateMissionId(),
    title: pickRandom(ESCORT_TITLES, rng),
    description: `Travel to ${targetPortName} without taking any damage. A pristine arrival is required.`,
    type: "ESCORT",
    targetPortName,
    reward: { gold: 25, glory: 2 },
    status: "ACTIVE",
    noDamageTaken: true,
  };
}

export function generateMission(
  currentPortName: string,
  G: CaribbeanState,
  rng: () => number
): Mission | null {
  // Randomly pick mission type with weights
  const roll = rng();
  let missionType: MissionType;

  if (roll < 0.4) {
    missionType = "DELIVERY";
  } else if (roll < 0.7) {
    missionType = "ASSASSINATION";
  } else {
    missionType = "ESCORT";
  }

  switch (missionType) {
    case "DELIVERY":
      return generateDeliveryMission(currentPortName, G.cells, rng);
    case "ASSASSINATION":
      return generateAssassinationMission(G.npcs, rng);
    case "ESCORT":
      return generateEscortMission(currentPortName, G.cells, rng);
    default:
      return null;
  }
}

export function canAffordTavern(gold: number): boolean {
  return gold >= TAVERN_COST;
}

export function getTavernCost(): number {
  return TAVERN_COST;
}

export function checkDeliveryMission(
  mission: Mission,
  currentPortName: string
): boolean {
  if (mission.type !== "DELIVERY") return false;
  if (mission.status !== "ACTIVE") return false;
  return mission.targetPortName === currentPortName;
}

export function checkEscortMission(
  mission: Mission,
  currentPortName: string
): boolean {
  if (mission.type !== "ESCORT") return false;
  if (mission.status !== "ACTIVE") return false;
  if (!mission.noDamageTaken) return false; // Failed due to damage
  return mission.targetPortName === currentPortName;
}

export function checkAssassinationMission(
  mission: Mission,
  sunkNpcId: string,
  npc: NPCShip | undefined
): boolean {
  if (mission.type !== "ASSASSINATION") return false;
  if (mission.status !== "ACTIVE") return false;

  // If mission has specific target, check it
  if (mission.targetNpcId) {
    return mission.targetNpcId === sunkNpcId;
  }

  // Generic assassination - any merchant counts
  return npc?.role === "MERCHANT";
}

export function failEscortMission(mission: Mission): void {
  if (mission.type === "ESCORT" && mission.status === "ACTIVE") {
    mission.noDamageTaken = false;
  }
}

export function completeMission(mission: Mission): void {
  mission.status = "COMPLETED";
}
