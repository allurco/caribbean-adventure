import { emptyCargo } from "./economy";
import type { CaribbeanState, NPCShip, ShipState } from "./types";

/**
 * What one seat may see of the match (#109): `G` with everything that seat
 * may not know taken out. `playerID` null or undefined is a spectator, who
 * sees nothing private. Pure: `G` is left as it was; the view shares its
 * unchanged parts.
 *
 * Hidden from a seat:
 * - the undealt captains (`captainDeck`): from everyone, the deck's order too;
 * - other seats' draft hands: only the seat's own hand stays;
 * - other seats' missions (`activeMission`), which only their tavern shows;
 * - other seats' stashed gold, which only their own ship's details show (the
 *   glory a stash earns stays in the public `score`, so its size can be
 *   guessed to within ten gold per point);
 * - the cargo and gold of a rival ship the seat has not scouted, and of an
 *   NPC nobody has identified: the spyglass is what reveals them (the ship
 *   tooltip shows them only then). They read as an empty hold and no gold.
 *
 * Everything drawn on the board or used to decide visibility stays: the map,
 * positions, classes, captains, damage, glory, bounties, pirates, combat,
 * floating loot, `scoutedShips` and `isIdentified`. An unidentified NPC keeps
 * its `nation` and `role` too: the 3D ship flies its nation's flag and wears
 * its role's colour (`shipLook.ts`), so they are seen whatever the tooltip says.
 */
export function playerViewFor(G: CaribbeanState, playerID: string | null | undefined): CaribbeanState {
  const seat = playerID ?? null;
  const scouted = (seat !== null && G.ships[seat]?.scoutedShips) || [];
  const ships: Record<string, ShipState> = {};
  for (const [id, ship] of Object.entries(G.ships)) {
    ships[id] = id === seat ? ship : rivalShip(ship, scouted.includes(id));
  }
  const npcs: Record<string, NPCShip> = {};
  for (const [id, npc] of Object.entries(G.npcs)) {
    npcs[id] = npc.isIdentified ? npc : { ...npc, cargo: emptyCargo(), gold: 0 };
  }
  return {
    ...G,
    ships,
    npcs,
    captainDeck: [],
    draftHands: seat !== null && seat in G.draftHands ? { [seat]: G.draftHands[seat] } : {},
  };
}

/**
 * Another seat's ship, as this seat sees it: no mission, no stash, and an
 * empty hold and purse unless this seat has scouted it.
 */
function rivalShip(ship: ShipState, scouted: boolean): ShipState {
  const seen: ShipState = { ...ship, stashedGold: 0 };
  delete seen.activeMission;
  if (!scouted) {
    seen.cargo = emptyCargo();
    seen.gold = 0;
  }
  return seen;
}
