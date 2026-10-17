import { describe, it, expect } from "vitest";
import { hex, hexGrid } from "../game/hex";
import type { Hex } from "../game/hex";
import type { MapCell } from "../game/mapGenerator";
import type { CaribbeanState, NPCShip } from "../game/types";
import { createShipState } from "../game/economy";
import { createNPCShip } from "../game/npcManager";
import { encounterTargets } from "./encounterTargets";

const DOCK = hex(2, 0);
const OFF_DOCK = hex(1, 0);
const FURTHER_OUT = hex(0, 0);

/** Water round the origin, with one island port at (3,0) whose docking hex is (2,0). */
function harbourMap(): MapCell[] {
  return hexGrid(5).map((h) =>
    h.q === 3 && h.r === 0
      ? { hex: h, terrain: "island" as const, hasPort: true, portName: "Haven", dockingHex: DOCK, elevation: 1 }
      : { hex: h, terrain: "water" as const, hasPort: false, elevation: 0 },
  );
}

function table(p0: Hex, p1: Hex, npcAt?: Hex): Pick<CaribbeanState, "cells" | "wrap" | "ships" | "npcs"> {
  const npcs: Record<string, NPCShip> = npcAt
    ? { "npc-0": createNPCShip("npc-0", npcAt, hex(-4, 0), "Spain", "Flute", () => 0.5) }
    : {};
  return {
    cells: harbourMap(),
    wrap: null,
    ships: { "0": createShipState(p0, "Frigate"), "1": createShipState(p1, "Frigate") },
    npcs,
  };
}

describe("the HUD's attack and spyglass targets (#388)", () => {
  it("offers a rival and an NPC at sea to attack and to scout", () => {
    const targets = encounterTargets(table(FURTHER_OUT, OFF_DOCK, hex(-1, 0)), "0");
    expect(targets.attack).toEqual({ players: ["1"], npcs: ["npc-0"] });
    expect(targets.scout).toEqual({ players: ["1"], npcs: ["npc-0"] });
    expect(targets.held).toEqual({ attack: false, scout: false });
  });

  it("leaves out a rival and an NPC docked at a port", () => {
    const docked = encounterTargets(table(OFF_DOCK, DOCK), "0");
    expect(docked.attack.players).toEqual([]);
    expect(docked.scout.players).toEqual([]);
    expect(docked.held).toEqual({ attack: false, scout: false });

    const npcDocked = encounterTargets(table(OFF_DOCK, hex(-4, 0), DOCK), "0");
    expect(npcDocked.attack.npcs).toEqual([]);
    expect(npcDocked.scout.npcs).toEqual([]);
  });

  it("offers nothing from a docking hex, and says it is held in port when a ship is in reach", () => {
    const docked = encounterTargets(table(DOCK, OFF_DOCK, hex(1, -1)), "0");
    expect(docked.attack).toEqual({ players: [], npcs: [] });
    expect(docked.scout).toEqual({ players: [], npcs: [] });
    expect(docked.held).toEqual({ attack: true, scout: true });
  });

  it("is not held in port when docked with nobody in reach", () => {
    expect(encounterTargets(table(DOCK, hex(-4, 0)), "0").held).toEqual({ attack: false, scout: false });
  });

  it("holds only the spyglass when a ship is in scouting reach but out of gun range", () => {
    // A Frigate scouts 3 hexes and fires 1: a rival two hexes off is a scout target only
    const docked = encounterTargets(table(DOCK, FURTHER_OUT), "0");
    expect(docked.held).toEqual({ attack: false, scout: true });
  });
});
