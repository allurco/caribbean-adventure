/**
 * What a ship looks like to the board (#134): its owner's colour, worn on
 * the pennant, the hull stripe and the main-course band, and the flag it
 * flies. Read from the game state through its selectors. Pure.
 */
import type { CaribbeanState, NPCShip } from "../game/types";
import { isPlayerPirate } from "../game/reputation";
import { shipFlagFor, type ShipFlag } from "./shipFlags";
import { shipOwnerColour } from "./shipOwnerColour";

export interface ShipLook {
  readonly colour: string;
  readonly flag: ShipFlag | null;
}

/** A player's ship: their colour, and their captain's nation or, once they have turned pirate, the Jolly Roger. */
export function playerShipLook(G: CaribbeanState, playerId: string): ShipLook {
  return {
    colour: shipOwnerColour({ kind: "player", playerId }),
    flag: shipFlagFor({ nation: G.ships[playerId]?.captain?.nation, pirate: isPlayerPirate(G, playerId) }),
  };
}

/** An NPC merchant or flotilla: its role's colour and its own nation's flag. NPCs are never pirates. */
export function npcShipLook(npc: Pick<NPCShip, "role" | "nation">): ShipLook {
  return {
    colour: shipOwnerColour({ kind: "npc", role: npc.role }),
    flag: shipFlagFor({ nation: npc.nation, pirate: false }),
  };
}
