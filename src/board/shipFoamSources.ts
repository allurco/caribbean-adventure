/**
 * Where the ships are this frame, for the water's hull foam (#38 step 7).
 *
 * Ships animate their positions per frame inside Ship.tsx, outside React
 * state, so the ocean cannot read them from props. Instead each Ship writes
 * its animated position, heading, hull length and speed here from its frame
 * callback, and Ocean.tsx reads the lot into a fixed-size uniform array in
 * its own. A rendering-side registry only: nothing here touches game state.
 *
 * Positions are canonical (the copy of the wrapping world the ship is built
 * in): the water shader wraps the distance east–west. Only the canonical
 * copy registers (Board.tsx), so a ship appears once however many copies
 * draw it. A ship that unmounts (sunk: SinkingShip takes over and does not
 * register) removes itself.
 */

/**
 * Ships the uniform array holds. A budget, not a bound: the game caps
 * nothing on the NPC side (merchants spawn by chance each turn and go when
 * they arrive; flotillas are at most one per nation per hunted player, up to
 * 4 × 6 on their own), so more ships than this can be afloat. The fill then
 * takes the players' ships first and the NPCs by id, and warns once.
 */
export const SHIP_FOAM_CAP = 24;
/** Floats per ship in the first array: x, z, heading x, heading z. */
export const SHIP_FOAM_FLOATS_A = 4;
/** Floats per ship in the second: hull length, speed. */
export const SHIP_FOAM_FLOATS_B = 2;

export interface ShipFoamSource {
  /** Animated world position on the sea, canonical copy. */
  x: number;
  z: number;
  /** Unit heading in world xz (the way the bow points). */
  headingX: number;
  headingZ: number;
  /** World units. */
  hullLength: number;
  /** World units per second. */
  speed: number;
  /** A player's ship: written ahead of every NPC when more than SHIP_FOAM_CAP ships register. */
  player: boolean;
}

export interface ShipFoamRegistry {
  set: (id: string, source: ShipFoamSource) => void;
  remove: (id: string) => void;
  /**
   * Writes the ships into `a` (SHIP_FOAM_FLOATS_A per ship: x, z, heading)
   * and `b` (SHIP_FOAM_FLOATS_B per ship: hull length, speed), at most
   * SHIP_FOAM_CAP of them, and returns how many were written. The order is
   * fixed by the ids alone: players first, then NPCs, each group by id, so
   * which ships lose their foam past the cap never depends on when they
   * registered. Past the cap it warns once.
   */
  fill: (a: Float32Array, b: Float32Array) => number;
}

/** Players first, then by id; plain code-point order, so it is the same everywhere. */
function compareFoamOrder(sources: Map<string, ShipFoamSource>, idA: string, idB: string): number {
  const playerA = sources.get(idA)?.player ?? false;
  const playerB = sources.get(idB)?.player ?? false;
  if (playerA !== playerB) return playerA ? -1 : 1;
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

export function createShipFoamRegistry(): ShipFoamRegistry {
  const sources = new Map<string, ShipFoamSource>();
  /** The ids in fill order; rebuilt only when the set of ids or a player flag changes. */
  let order: string[] = [];
  let orderStale = false;
  let warned = false;
  return {
    set: (id, source) => {
      const previous = sources.get(id);
      if (!previous || previous.player !== source.player) orderStale = true;
      sources.set(id, source);
    },
    remove: (id) => {
      if (sources.delete(id)) orderStale = true;
    },
    fill: (a, b) => {
      if (orderStale) {
        order = [...sources.keys()].sort((idA, idB) => compareFoamOrder(sources, idA, idB));
        orderStale = false;
      }
      if (order.length > SHIP_FOAM_CAP && !warned) {
        warned = true;
        console.warn(
          `Hull foam: ${order.length} ships registered but the water draws foam for at most ${SHIP_FOAM_CAP} (SHIP_FOAM_CAP); the last NPCs by id go without.`
        );
      }
      const n = Math.min(order.length, SHIP_FOAM_CAP);
      for (let i = 0; i < n; i++) {
        const s = sources.get(order[i])!;
        a[i * SHIP_FOAM_FLOATS_A] = s.x;
        a[i * SHIP_FOAM_FLOATS_A + 1] = s.z;
        a[i * SHIP_FOAM_FLOATS_A + 2] = s.headingX;
        a[i * SHIP_FOAM_FLOATS_A + 3] = s.headingZ;
        b[i * SHIP_FOAM_FLOATS_B] = s.hullLength;
        b[i * SHIP_FOAM_FLOATS_B + 1] = s.speed;
      }
      return n;
    },
  };
}

/** The board's one registry, written by Ship.tsx and read by Ocean.tsx. */
export const shipFoamSources: ShipFoamRegistry = createShipFoamRegistry();
