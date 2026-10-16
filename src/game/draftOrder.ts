import type { CaribbeanState } from "./types";

/**
 * The draft's turns (#111). Every seat still choosing may pick at once (a
 * seat per client, online or on one page), so nobody waits for the seats
 * before them. The turns still walk the seats in order, each passing on as
 * its seat picks, so the one hotseat screen, which acts as whoever's turn it
 * is, passes the pick from player to player as before.
 */

/** Has this seat taken command: a captain and a ship class? */
export function hasPicked(G: Pick<CaribbeanState, "ships">, seat: string): boolean {
  const ship = G.ships[seat];
  return ship?.captain !== undefined && ship.shipClass !== undefined;
}

/** Has every seat picked? Then the draft is over. */
export function everySeatPicked(G: Pick<CaribbeanState, "ships">): boolean {
  return Object.keys(G.ships).every((seat) => hasPicked(G, seat));
}

/**
 * The play-order position whose turn the draft passes to after `from`: the
 * next seat still choosing. Once every seat has picked, the last seat's, so
 * the draft ends there whoever picked last, and the main phase, which moves
 * the turn on a seat from where the phase before ended, begins at seat 0.
 */
export function nextToPick(G: Pick<CaribbeanState, "ships">, playOrder: readonly string[], from: number): number {
  for (let step = 1; step <= playOrder.length; step++) {
    const pos = (from + step) % playOrder.length;
    if (!hasPicked(G, playOrder[pos])) return pos;
  }
  return playOrder.length - 1;
}

/**
 * The draft ends once every seat has picked and its turns have reached the
 * last seat (`nextToPick`). A game that starts with its captains already in
 * command starts in the main phase, not here (`withMainPhase` in tests).
 */
export function draftOver(
  G: Pick<CaribbeanState, "ships">,
  playOrder: readonly string[],
  playOrderPos: number,
): boolean {
  if (!everySeatPicked(G)) return false;
  return playOrderPos === playOrder.length - 1;
}
