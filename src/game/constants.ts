import type { ShipClass, ShipStats, ShipUpgrade } from "./types";

export const SHIP_SPECS: Record<ShipClass, ShipStats> = {
  Sloop: {
    maneuverability: 4,
    scouting: 3,
    cannons: 2,
    crew: { current: 2, max: 2 },
    hull: { current: 2, max: 2 },
    cargo: 2,
  },
  Flute: {
    maneuverability: 2,
    scouting: 2,
    cannons: 2,
    crew: { current: 3, max: 3 },
    hull: { current: 4, max: 4 },
    cargo: 4,
  },
  Frigate: {
    maneuverability: 3,
    scouting: 3,
    cannons: 4,
    crew: { current: 4, max: 4 },
    hull: { current: 5, max: 5 },
    cargo: 3,
  },
  Galleon: {
    maneuverability: 1,
    scouting: 2,
    cannons: 3,
    crew: { current: 5, max: 5 },
    hull: { current: 7, max: 7 },
    cargo: 6,
  },
};

export const SHIP_COSTS: Record<ShipClass, number> = {
  Sloop: 20,
  Flute: 30,
  Frigate: 40,
  Galleon: 60,
};

export const REPAIR_COST_PER_POINT = 5;

export const UPGRADES: Record<string, ShipUpgrade> = {
  chain_shot: {
    id: "chain_shot",
    name: "Chain Shot",
    cost: 10,
    description: "+Damage to Masts in combat",
    effect: {},
  },
  grape_shot: {
    id: "grape_shot",
    name: "Grape Shot",
    cost: 10,
    description: "+Damage to Crew in combat",
    effect: {},
  },
  long_guns: {
    id: "long_guns",
    name: "Long Guns",
    cost: 15,
    description: "+1 Scouting range",
    effect: { scouting: 1 },
  },
  hull_reinforcement: {
    id: "hull_reinforcement",
    name: "Hull Hardening",
    cost: 20,
    description: "+1 Max Hull",
    effect: { hullMax: 1 },
  },
  hammocks: {
    id: "hammocks",
    name: "Hammocks",
    cost: 10,
    description: "+1 Max Crew",
    effect: { crewMax: 1 },
  },
};
