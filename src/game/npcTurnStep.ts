import type { CaribbeanState } from "./types";
import { moveAllNPCs, spawnMerchant } from "./npcManager";

/** The chance a new merchant puts to sea as a turn ends. */
export const MERCHANT_SPAWN_CHANCE = 0.1;

/**
 * The NPCs' step as a turn ends: they all sail, and now and then a new
 * merchant spawns. A turn that ends in a fight (#284) takes its step when
 * the fight resolves, not as it starts (#288): while `G.combat` is set the
 * NPCs hold still, so each turn steps them exactly once whichever way it
 * ends. Run by both the main and the combat phase's turn `onEnd`.
 */
export function npcTurnEndStep(G: CaribbeanState, randomNumber: () => number): void {
  if (G.combat) return;
  moveAllNPCs(G);
  if (randomNumber() < MERCHANT_SPAWN_CHANCE) spawnMerchant(G, randomNumber);
}
