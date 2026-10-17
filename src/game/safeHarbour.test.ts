import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexGrid } from "./hex";
import type { Hex } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { MapSizeId } from "./mapConfig";
import type { CaribbeanState, NPCShip } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { createShipState } from "./economy";
import { createFlotillaShip, createNPCShip } from "./npcManager";
import { atPort, harbourKeepsApart } from "./safeHarbour";
import { silenceInvalidMoveLogs } from "../testSupport/silenceInvalidMoveLogs";

// These tests send refused moves on purpose; boardgame.io logs each one.
silenceInvalidMoveLogs();

/** Water round the origin, with one island port at (3,0) whose docking hex is (2,0). */
function harbourMap(): MapCell[] {
  return hexGrid(5).map((h) =>
    h.q === 3 && h.r === 0
      ? { hex: h, terrain: "island" as const, hasPort: true, portName: "Haven", dockingHex: hex(2, 0), elevation: 1 }
      : { hex: h, terrain: "water" as const, hasPort: false, elevation: 0 },
  );
}

describe("ports are safe harbours (#388)", () => {
  const world = { cells: harbourMap(), wrap: null };

  it("a ship on a port's docking hex is at port; one a hex off is not", () => {
    expect(atPort(world, hex(2, 0))).toBe(true);
    expect(atPort(world, hex(1, 0))).toBe(false);
  });

  it("keeps two ships apart when either one is at port", () => {
    expect(harbourKeepsApart(world, hex(2, 0), hex(1, 0))).toBe(true);
    expect(harbourKeepsApart(world, hex(1, 0), hex(2, 0))).toBe(true);
    expect(harbourKeepsApart(world, hex(1, 0), hex(0, 0))).toBe(false);
  });
});

/** A Spanish merchant, "npc-0", at `at`. */
function merchantAt(at: Hex): NPCShip {
  return createNPCShip("npc-0", at, hex(-4, 0), "Spain", "Flute", () => 0.5);
}

/** A main-phase game on the harbour map: player 0 at `p0`, player 1 at `p1`, and `npc` if given. */
function harbourGame(p0: Hex, p1: Hex, npc?: NPCShip) {
  const npcs: Record<string, NPCShip> = npc ? { [npc.id]: npc } : {};
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed: "safe-harbour",
    phases: {
      main: { ...(Caribbean.phases?.main ?? {}), start: true },
      combat: Caribbean.phases!.combat!,
    },
    setup: () => ({
      cells: harbourMap(),
      ships: { "0": createShipState(p0, "Frigate"), "1": createShipState(p1, "Frigate") },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs,
      npcIdCounter: 1,
      wrap: null,
      pirates: {},
      bountyClaims: [],
      movesUsed: 0,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: 2 });
  client.start();
  return client;
}

const DOCK = hex(2, 0);
const OFF_DOCK = hex(1, 0);
const FURTHER_OUT = hex(0, 0);

describe("no fighting in port (#388)", () => {
  it("a ship can't attack a rival docked at a port", () => {
    const client = harbourGame(OFF_DOCK, DOCK);
    client.moves.attackShip("1");
    expect(client.getState()!.G.combat).toBeUndefined();
  });

  it("a docked ship can't attack a rival at sea", () => {
    const client = harbourGame(DOCK, OFF_DOCK);
    client.moves.attackShip("1");
    expect(client.getState()!.G.combat).toBeUndefined();
  });

  it("two ships at sea still fight", () => {
    const client = harbourGame(FURTHER_OUT, OFF_DOCK);
    client.moves.attackShip("1");
    expect(client.getState()!.G.combat).toBeDefined();
  });

  it("a ship can't attack an NPC on a docking hex, nor attack one from a docking hex", () => {
    const atNpcDock = harbourGame(OFF_DOCK, hex(-4, 0), merchantAt(DOCK));
    atNpcDock.moves.attackNPC("npc-0");
    expect(atNpcDock.getState()!.G.combat).toBeUndefined();

    const fromDock = harbourGame(DOCK, hex(-4, 0), merchantAt(OFF_DOCK));
    fromDock.moves.attackNPC("npc-0");
    expect(fromDock.getState()!.G.combat).toBeUndefined();

    const atSea = harbourGame(FURTHER_OUT, hex(-4, 0), merchantAt(OFF_DOCK));
    atSea.moves.attackNPC("npc-0");
    expect(atSea.getState()!.G.combat).toBeDefined();
  });
});

describe("NPCs keep the harbour peace (#388)", () => {
  // No NPC opens a fight today: flotillas and merchants only sail. This holds
  // the line should a hunter ever learn to strike: a docked ship is safe.
  it("a flotilla hunting a docked ship sails round after round without a fight", () => {
    const hunter = createFlotillaShip("npc-0", hex(1, -1), "Spain", "Frigate", "0");
    const client = harbourGame(DOCK, hex(-4, 0), hunter);
    for (let i = 0; i < 4; i++) {
      client.events.endTurn!();
      expect(client.getState()!.G.combat).toBeUndefined();
    }
  });
});

describe("no spyglass in port (#388)", () => {
  it("can't scout a docked rival, nor scout from a docking hex", () => {
    const atDock = harbourGame(OFF_DOCK, DOCK);
    atDock.moves.spyglass("1", false);
    expect(atDock.getState()!.G.ships["0"].scoutedShips).toEqual([]);

    const fromDock = harbourGame(DOCK, OFF_DOCK);
    fromDock.moves.spyglass("1", false);
    expect(fromDock.getState()!.G.ships["0"].scoutedShips).toEqual([]);

    const atSea = harbourGame(FURTHER_OUT, OFF_DOCK);
    atSea.moves.spyglass("1", false);
    expect(atSea.getState()!.G.ships["0"].scoutedShips).toEqual(["1"]);
  });

  it("can't identify a docked NPC, nor identify one from a docking hex", () => {
    const atDock = harbourGame(OFF_DOCK, hex(-4, 0), merchantAt(DOCK));
    atDock.moves.spyglass("npc-0", true);
    expect(atDock.getState()!.G.npcs["npc-0"].isIdentified).toBe(false);

    const fromDock = harbourGame(DOCK, hex(-4, 0), merchantAt(OFF_DOCK));
    fromDock.moves.spyglass("npc-0", true);
    expect(fromDock.getState()!.G.npcs["npc-0"].isIdentified).toBe(false);

    const atSea = harbourGame(FURTHER_OUT, hex(-4, 0), merchantAt(OFF_DOCK));
    atSea.moves.spyglass("npc-0", true);
    expect(atSea.getState()!.G.npcs["npc-0"].isIdentified).toBe(true);
  });
});
