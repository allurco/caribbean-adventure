/**
 * Whom the HUD offers to the Attack and Spyglass buttons. Ports are safe
 * harbours (#388): a docked ship is never a target, and a ship on a docking
 * hex has none, its buttons shown disabled when a ship would otherwise be in
 * reach (`heldInPort`, with `NO_FIGHTING_IN_PORT` as the reason).
 */
import type { Hex } from "../game/hex";
import type { CaribbeanState } from "../game/types";
import { getValidAttackTargets, getValidNPCAttackTargets } from "../game/combat";
import { getValidScoutTargets } from "../game/scouting";
import { atPort } from "../game/safeHarbour";

export interface TargetIds {
  players: string[];
  npcs: string[];
}

export interface EncounterTargets {
  attack: TargetIds;
  scout: TargetIds;
  /** The seat's ship is at port with a ship in reach: Attack and Spyglass show, disabled. */
  heldInPort: boolean;
}

/** Why the Attack and Spyglass buttons are disabled at port. */
export const NO_FIGHTING_IN_PORT = "No fighting in port";

const NONE: TargetIds = { players: [], npcs: [] };

export function encounterTargets(
  G: Pick<CaribbeanState, "cells" | "wrap" | "ships" | "npcs">,
  seat: string,
): EncounterTargets {
  const ship = G.ships[seat];
  if (!ship) return { attack: NONE, scout: NONE, heldInPort: false };

  const atSea = (position: Hex) => !atPort(G, position);
  const scout = getValidScoutTargets(ship, seat, G.ships, G.npcs, G.wrap);
  const inReach: EncounterTargets = {
    attack: {
      players: getValidAttackTargets(ship, G.ships, seat, G.wrap).filter((id) => atSea(G.ships[id].position)),
      npcs: getValidNPCAttackTargets(ship, G.npcs, G.wrap).filter((id) => atSea(G.npcs[id].position)),
    },
    scout: {
      players: scout.players.filter((id) => atSea(G.ships[id].position)),
      npcs: scout.npcs.filter((id) => atSea(G.npcs[id].position)),
    },
    heldInPort: false,
  };

  if (atSea(ship.position)) return inReach;
  const anyInReach = [inReach.attack, inReach.scout].some((t) => t.players.length + t.npcs.length > 0);
  return { attack: NONE, scout: NONE, heldInPort: anyInReach };
}
