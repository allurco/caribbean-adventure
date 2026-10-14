import { describe, it, expect } from "vitest";
import type { CaribbeanState } from "../game/types";
import { npcShipLook, playerShipLook } from "./shipLook";
import { NPC_FLOTILLA_COLOUR, NPC_MERCHANT_COLOUR, PLAYER_COLOURS } from "./shipOwnerColour";

/** Just the state the look reads: the players' captains and who has turned pirate. */
const state = (pirates: CaribbeanState["pirates"]): CaribbeanState =>
  ({
    ships: {
      "0": { captain: { id: "c0", name: "Anne", nation: "England", ability: "" } },
      "1": { captain: { id: "c1", name: "Jean", nation: "France", ability: "" } },
    },
    pirates,
  }) as unknown as CaribbeanState;

describe("playerShipLook", () => {
  it("flies the captain's nation in the player's colour", () => {
    const G = state({});
    expect(playerShipLook(G, "0")).toEqual({ colour: PLAYER_COLOURS["0"], flag: "England" });
    expect(playerShipLook(G, "1")).toEqual({ colour: PLAYER_COLOURS["1"], flag: "France" });
  });

  it("flies the Jolly Roger once the player is marked pirate in G, keeping their colour on the pennant, stripe and band", () => {
    const G = state({ "0": { turn: 3, cause: "sink" } });
    expect(playerShipLook(G, "0")).toEqual({ colour: PLAYER_COLOURS["0"], flag: "JollyRoger" });
    // the other player is no pirate
    expect(playerShipLook(G, "1").flag).toBe("France");
  });

  it("reads a game without a pirates record as no pirates", () => {
    expect(playerShipLook(state(undefined), "0").flag).toBe("England");
  });
});

describe("npcShipLook", () => {
  it("flies the NPC's own nation, never the Jolly Roger, in its role's colour", () => {
    expect(npcShipLook({ role: "MERCHANT", nation: "Spain" })).toEqual({ colour: NPC_MERCHANT_COLOUR, flag: "Spain" });
    expect(npcShipLook({ role: "FLOTILLA", nation: "Netherlands" })).toEqual({ colour: NPC_FLOTILLA_COLOUR, flag: "Netherlands" });
  });
});
