/**
 * The owner's colour a ship wears (#134): on its pennant, its hull stripe
 * and the band across its main course, and on the box a ship without a
 * model is drawn as. Players wear their player colour; NPC merchants and
 * flotillas their NPC colours. Pure.
 */
import type { NPCRole } from "../game/types";

export const PLAYER_COLOURS: Readonly<Record<string, string>> = {
  "0": "#3b82f6", // blue
  "1": "#ef4444", // red
  "2": "#22c55e", // green
  "3": "#eab308", // yellow
};

/** A player without a colour of their own. */
export const UNKNOWN_PLAYER_COLOUR = "#888888";

export const NPC_MERCHANT_COLOUR = "#d4a574"; // tan/beige for merchant ships
export const NPC_FLOTILLA_COLOUR = "#8b0000"; // dark red for military/flotilla ships

export type ShipOwner = { readonly kind: "player"; readonly playerId: string } | { readonly kind: "npc"; readonly role: NPCRole };

export function shipOwnerColour(owner: ShipOwner): string {
  if (owner.kind === "player") return PLAYER_COLOURS[owner.playerId] ?? UNKNOWN_PLAYER_COLOUR;
  return owner.role === "FLOTILLA" ? NPC_FLOTILLA_COLOUR : NPC_MERCHANT_COLOUR;
}
