/**
 * The ships a fight's beats still show after they have left `G` (#263): a
 * ship that sank goes down on the board after the move that sank her, and a
 * merchant taken by boarding stays alongside while the grapples fly. Pure:
 * what to draw for each, from the state she was last in.
 */
import type { CaribbeanState, ShipClass } from "../../game/types";
import { hexToWorld } from "../../game/hex";
import { npcShipLook, playerShipLook } from "../shipLook";
import type { ShipFlag } from "../shipFlags";
import type { CombatBeat } from "./combatTimeline";

export interface DepartedShip {
  id: string;
  position: [number, number, number];
  color: string;
  shipClass?: ShipClass;
  /** The heading it last lay at, which it keeps until the fight moves it. */
  heading: number;
  flag: ShipFlag | null;
  /** She goes down (sunk), rather than staying afloat as a prize. */
  sinks: boolean;
}

/** The departed ships `beats` show, drawn from `prev`, the state they were last in. */
export function departedShips(
  prev: CaribbeanState,
  next: CaribbeanState,
  beats: readonly CombatBeat[],
  headingOf: (id: string) => number
): DepartedShip[] {
  const out: DepartedShip[] = [];
  const add = (id: string, sinks: boolean) => {
    if (id in next.ships || id in next.npcs) return;
    const ship = prev.ships[id];
    const npc = prev.npcs[id];
    if (ship) {
      const look = playerShipLook(prev, id, ship);
      out.push({ id, position: hexToWorld(ship.position), color: look.colour, flag: look.flag, shipClass: ship.shipClass, heading: headingOf(id), sinks });
    } else if (npc) {
      const look = npcShipLook(npc);
      out.push({ id, position: hexToWorld(npc.position), color: look.colour, flag: look.flag, shipClass: npc.shipClass, heading: headingOf(id), sinks });
    }
  };
  for (const beat of beats) {
    if (beat.kind === "sink") add(beat.shipId, true);
    if (beat.kind === "closeAlongside") add(beat.defenderId, false);
  }
  return out;
}
