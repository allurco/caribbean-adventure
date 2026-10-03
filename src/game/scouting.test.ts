import { describe, it, expect } from "vitest";
import { createWrap, offsetToHex, NO_WRAP } from "./hex";
import { createShipState } from "./economy";
import { createNPCShip } from "./npcManager";
import { isInScoutingRange, canScoutNPC, canScoutPlayer, getValidScoutTargets } from "./scouting";

describe("scouting across the east–west seam", () => {
  const wrap = createWrap(8);
  const east = offsetToHex(7, 2);
  const west = offsetToHex(0, 2);

  it("puts a target just across the seam in range", () => {
    const scout = createShipState(east, "Sloop");
    expect(isInScoutingRange(scout, west, wrap)).toBe(true);
    expect(isInScoutingRange(scout, west, NO_WRAP)).toBe(false);
  });

  it("lets the spyglass pick out players and NPCs across the seam", () => {
    const scout = createShipState(east, "Sloop");
    const other = createShipState(west, "Sloop");
    const npc = createNPCShip("npc-1", offsetToHex(0, 1), offsetToHex(4, 4), "Spain", "Flute", () => 0.5);

    expect(canScoutPlayer(scout, other, "1", wrap)).toBe(true);
    expect(canScoutNPC(scout, npc, wrap)).toBe(true);

    const targets = getValidScoutTargets(scout, "0", { "0": scout, "1": other }, { "npc-1": npc }, wrap);
    expect(targets.players).toEqual(["1"]);
    expect(targets.npcs).toEqual(["npc-1"]);
  });
});
