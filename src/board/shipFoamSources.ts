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

/** Ships the uniform array holds: six players plus their merchants and flotillas fit. */
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
}

export interface ShipFoamRegistry {
  set: (id: string, source: ShipFoamSource) => void;
  remove: (id: string) => void;
  /**
   * Writes the ships into `a` (SHIP_FOAM_FLOATS_A per ship: x, z, heading)
   * and `b` (SHIP_FOAM_FLOATS_B per ship: hull length, speed), at most
   * SHIP_FOAM_CAP of them, and returns how many were written.
   */
  fill: (a: Float32Array, b: Float32Array) => number;
}

export function createShipFoamRegistry(): ShipFoamRegistry {
  const sources = new Map<string, ShipFoamSource>();
  return {
    set: (id, source) => {
      sources.set(id, source);
    },
    remove: (id) => {
      sources.delete(id);
    },
    fill: (a, b) => {
      let n = 0;
      for (const s of sources.values()) {
        if (n >= SHIP_FOAM_CAP) break;
        a[n * SHIP_FOAM_FLOATS_A] = s.x;
        a[n * SHIP_FOAM_FLOATS_A + 1] = s.z;
        a[n * SHIP_FOAM_FLOATS_A + 2] = s.headingX;
        a[n * SHIP_FOAM_FLOATS_A + 3] = s.headingZ;
        b[n * SHIP_FOAM_FLOATS_B] = s.hullLength;
        b[n * SHIP_FOAM_FLOATS_B + 1] = s.speed;
        n++;
      }
      return n;
    },
  };
}

/** The board's one registry, written by Ship.tsx and read by Ocean.tsx. */
export const shipFoamSources: ShipFoamRegistry = createShipFoamRegistry();
