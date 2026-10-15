import type { Nation, NPCShip } from "../game/types";

/**
 * What the board calls an NPC ship: the combat panel's label, and the name
 * a line about a fight uses ("a Spanish flotilla"). Pure.
 */

const NATION_ADJECTIVE: Record<Nation, string> = {
  England: "English",
  France: "French",
  Spain: "Spanish",
  Netherlands: "Dutch",
};

/** Its role, as a label: "Merchant" or "Flotilla". */
export function npcKind(npc: Pick<NPCShip, "role">): string {
  return npc.role === "FLOTILLA" ? "Flotilla" : "Merchant";
}

/** Its name in a sentence: nation and role, with its article ("an English merchant"). */
export function npcName(npc: Pick<NPCShip, "role" | "nation">): string {
  const adjective = NATION_ADJECTIVE[npc.nation];
  const article = /^[AEIOU]/.test(adjective) ? "an" : "a";
  return `${article} ${adjective} ${npcKind(npc).toLowerCase()}`;
}
