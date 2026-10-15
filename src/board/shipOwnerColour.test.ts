import { describe, it, expect } from "vitest";
import { NPC_FLOTILLA_COLOUR, NPC_MERCHANT_COLOUR, PLAYER_COLOURS, UNKNOWN_PLAYER_COLOUR, shipOwnerColour } from "./shipOwnerColour";

describe("shipOwnerColour", () => {
  it("gives a player's ship that player's colour", () => {
    expect(shipOwnerColour({ kind: "player", playerId: "0" })).toBe(PLAYER_COLOURS["0"]);
    expect(shipOwnerColour({ kind: "player", playerId: "1" })).toBe(PLAYER_COLOURS["1"]);
  });

  it("tells two players apart", () => {
    expect(shipOwnerColour({ kind: "player", playerId: "0" })).not.toBe(shipOwnerColour({ kind: "player", playerId: "1" }));
  });

  it("gives each of the four seats a colour of its own (#278)", () => {
    const colours = ["0", "1", "2", "3"].map((playerId) => shipOwnerColour({ kind: "player", playerId }));
    expect(colours).not.toContain(UNKNOWN_PLAYER_COLOUR);
    expect(new Set(colours).size).toBe(4);
  });

  it("gives a player with no colour of their own the neutral grey", () => {
    expect(shipOwnerColour({ kind: "player", playerId: "9" })).toBe(UNKNOWN_PLAYER_COLOUR);
  });

  it("gives NPC merchants and flotillas their own NPC colours, apart from each other and every player's", () => {
    expect(shipOwnerColour({ kind: "npc", role: "MERCHANT" })).toBe(NPC_MERCHANT_COLOUR);
    expect(shipOwnerColour({ kind: "npc", role: "FLOTILLA" })).toBe(NPC_FLOTILLA_COLOUR);
    expect(NPC_MERCHANT_COLOUR).not.toBe(NPC_FLOTILLA_COLOUR);
    for (const colour of Object.values(PLAYER_COLOURS)) {
      expect([NPC_MERCHANT_COLOUR, NPC_FLOTILLA_COLOUR]).not.toContain(colour);
    }
  });
});
