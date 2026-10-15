import { describe, expect, it } from "vitest";
import { createShipState } from "../game/economy";
import { hex } from "../game/hex";
import { createNPCShip } from "../game/npcManager";
import type { CaribbeanState } from "../game/types";
import { windFor } from "../game/wind";
import { gaugeLine } from "./combatGauge";

/** Wind toward +z: the ship with the smaller z is upwind. */
const TOWARD_PLUS_Z = windFor({ angle: Math.PI / 2, speed: 7 });

function table(): Pick<CaribbeanState, "ships" | "npcs" | "wrap"> {
  const ships: CaribbeanState["ships"] = { "0": createShipState(hex(0, 0)), "1": createShipState(hex(0, 2)) };
  ships["0"].captain = { id: "a", name: "Anne Bonny", nation: "England", ability: "-" };
  const merchant = { ...createNPCShip("npc-1", hex(0, -2), hex(6, 0), "Spain", "Flute", () => 0.5), role: "MERCHANT" as const };
  return { ships, npcs: { "npc-1": merchant }, wrap: null };
}

describe("gaugeLine: who holds the weather gauge, on the combat panel", () => {
  it("names the upwind captain", () => {
    expect(gaugeLine(table(), { attackerId: "0", defenderId: "1", isNPCCombat: false }, TOWARD_PLUS_Z)).toBe(
      "Weather gauge: Anne Bonny"
    );
  });

  it("names an upwind NPC as the panel does", () => {
    expect(gaugeLine(table(), { attackerId: "0", defenderId: "npc-1", isNPCCombat: true }, TOWARD_PLUS_Z)).toBe(
      "Weather gauge: a Spanish merchant"
    );
  });

  it("says neither holds it when the ships sit square to the wind", () => {
    const G = table();
    G.ships["1"].position = hex(2, -1);
    expect(gaugeLine(G, { attackerId: "0", defenderId: "1", isNPCCombat: false }, TOWARD_PLUS_Z)).toBe(
      "Weather gauge: neither, square to the wind"
    );
  });

  it("says nothing when a side is missing", () => {
    expect(gaugeLine(table(), { attackerId: "0", defenderId: "npc-9", isNPCCombat: true }, TOWARD_PLUS_Z)).toBeNull();
  });
});
