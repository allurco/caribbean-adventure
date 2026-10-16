import { createShipState, emptyCargo } from "./economy";
import { hex } from "./hex";
import { hasPicked } from "./draftOrder";
import type { CaribbeanState, NPCShip, ShipState } from "./types";

/**
 * What one seat may see of the match (#109): `G` with everything that seat
 * may not know taken out. `playerID` null or undefined is a spectator, who
 * sees nothing private. Pure: `G` is left as it was; the view shares its
 * unchanged parts.
 *
 * Hidden from a seat:
 * - the undealt captains (`captainDeck`): from everyone, the deck's order too;
 * - other seats' draft hands: only the seat's own hand stays, a replacement
 *   captain's hand (#265) as much as the draft's;
 * - other seats' missions (`activeMission`), which only their tavern shows;
 * - other seats' stashed gold, which only their own ship's details show, and
 *   the stash a seat that lost its ship keeps for its next captain (the
 *   glory a stash earns stays in the public `score`, so its size can be
 *   guessed to within ten gold per point);
 * - the cargo and gold of a rival ship the seat has not scouted, and of an
 *   NPC nobody has identified: the spyglass is what reveals them (the ship
 *   tooltip shows them only then). They read as an empty hold and no gold;
 * - how many missions other seats have drawn (`missionIdCounters`, #320):
 *   watched across updates, a count would tell when a seat visited a tavern.
 *   A seat keeps its own, which its missions' ids show anyway;
 * - while the draft is on (`phase` "draft", #111), which captain and ship
 *   another seat picked: every seat picks at once, so nobody waits, and none
 *   picks knowing another's choice. A seat that has picked reads as a ship
 *   not yet commanded, marked `draftPicked`; all is shown once the draft ends.
 *
 * Everything drawn on the board or used to decide visibility stays: the map,
 * positions, classes, captains, damage, glory, bounties, pirates, combat,
 * floating loot, `scoutedShips` and `isIdentified`. An unidentified NPC keeps
 * its `nation` and `role` too: the 3D ship flies its nation's flag and wears
 * its role's colour (`shipLook.ts`), so they are seen whatever the tooltip says.
 */
export function playerViewFor(G: CaribbeanState, playerID: string | null | undefined, phase?: string | null): CaribbeanState {
  const seat = playerID ?? null;
  const scouted = (seat !== null && G.ships[seat]?.scoutedShips) || [];
  const ships: Record<string, ShipState> = {};
  for (const [id, ship] of Object.entries(G.ships)) {
    if (id === seat) ships[id] = ship;
    else if (phase === "draft" && hasPicked(G, id)) ships[id] = hiddenPick();
    else ships[id] = rivalShip(ship, scouted.includes(id));
  }
  const npcs: Record<string, NPCShip> = {};
  for (const [id, npc] of Object.entries(G.npcs)) {
    npcs[id] = npc.isIdentified ? npc : { ...npc, cargo: emptyCargo(), gold: 0 };
  }
  const lostShips = G.lostShips && Object.fromEntries(
    Object.entries(G.lostShips).map(([id, lost]) => [id, id === seat ? lost : { ...lost, stashedGold: 0 }])
  );
  const missionIdCounters = G.missionIdCounters && (seat !== null && seat in G.missionIdCounters ? { [seat]: G.missionIdCounters[seat] } : {});
  return {
    ...G,
    ...(missionIdCounters ? { missionIdCounters } : {}),
    ships,
    npcs,
    ...(lostShips ? { lostShips } : {}),
    captainDeck: [],
    draftHands: seat !== null && seat in G.draftHands ? { [seat]: G.draftHands[seat] } : {},
  };
}

/** Another seat's ship once it has picked, in the draft: as it was dealt (`setup`), but marked picked. */
function hiddenPick(): ShipState {
  return { ...createShipState(hex(0, 0)), draftPicked: true };
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
