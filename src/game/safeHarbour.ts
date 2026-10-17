/**
 * Ports are safe harbours (#388): a ship on a port's docking hex can't attack
 * or be attacked, and can't use the spyglass or be scouted. "At port" is the
 * same test that opens the port panel, `findAccessiblePort`.
 */
import type { Hex, MapWrap } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { CaribbeanState } from "./types";
import { findAccessiblePort } from "./moves";
import { getValidAttackTargets, getValidNPCAttackTargets } from "./combat";
import { getValidScoutTargets } from "./scouting";

/** The map a harbour check needs: `G` will do. */
export interface HarbourWorld {
  cells: MapCell[];
  wrap: MapWrap;
}

/** Is this position a port's docking hex? */
export function atPort(world: HarbourWorld, position: Hex): boolean {
  return findAccessiblePort(position, world.cells, world.wrap) !== undefined;
}

/** May no fight or spyglass pass between these two ships, because either one is at port? */
export function harbourKeepsApart(world: HarbourWorld, a: Hex, b: Hex): boolean {
  return atPort(world, a) || atPort(world, b);
}

export interface TargetIds {
  players: string[];
  npcs: string[];
}

export interface HarbourTargets {
  attack: TargetIds;
  scout: TargetIds;
  /** The seat's ship is at port with a ship otherwise in reach: that action is held, not offered. */
  held: { attack: boolean; scout: boolean };
}

const NONE: TargetIds = { players: [], npcs: [] };
const hasAny = (t: TargetIds) => t.players.length + t.npcs.length > 0;

/**
 * Whom `seat` may attack and scout, by the same rule the moves apply: in reach,
 * and no harbour keeping them apart. `held` says, per action, that the seat is
 * at port with a ship otherwise in reach.
 */
export function harbourTargets(
  G: HarbourWorld & Pick<CaribbeanState, "ships" | "npcs">,
  seat: string,
): HarbourTargets {
  const ship = G.ships[seat];
  if (!ship) return { attack: NONE, scout: NONE, held: { attack: false, scout: false } };

  const scoutInReach = getValidScoutTargets(ship, seat, G.ships, G.npcs, G.wrap);
  const inReach = {
    attack: {
      players: getValidAttackTargets(ship, G.ships, seat, G.wrap),
      npcs: getValidNPCAttackTargets(ship, G.npcs, G.wrap),
    },
    scout: scoutInReach,
  };
  const open = (t: TargetIds): TargetIds => ({
    players: t.players.filter((id) => !harbourKeepsApart(G, ship.position, G.ships[id].position)),
    npcs: t.npcs.filter((id) => !harbourKeepsApart(G, ship.position, G.npcs[id].position)),
  });
  const attack = open(inReach.attack);
  const scout = open(inReach.scout);
  const docked = atPort(G, ship.position);
  return {
    attack,
    scout,
    held: { attack: docked && hasAny(inReach.attack), scout: docked && hasAny(inReach.scout) },
  };
}
