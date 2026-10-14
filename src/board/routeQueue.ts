/**
 * Sailing a planned route one `moveShip` at a time (#213). The client sends
 * the first step, waits until the game has applied it, then sends the next,
 * so every step is still checked by the game and costs one move, and the
 * ship's motion chains the hexes into one curve (`setCourse`, shipMotion.ts).
 * It drops the rest of the route when a step would be refused or something
 * happens on the way (combat, the turn or phase ending, arriving at a port's
 * docking hex): the moves not used stay with the player. Pure; the board
 * feeds it what it sees after each update and dispatches what it says.
 */
import type { Hex, MapWrap } from "../game/hex";
import { wrappedEquals } from "../game/hex";
import { movesLeft, movesUsed } from "../game/turnMoves";
import type { CaribbeanState } from "../game/types";
import { findAccessiblePort, validMoveTargets } from "../game/moves";

/** How long a sent step may go unapplied before the route is given up as refused. */
export const STEP_TIMEOUT_MS = 2000;

export interface RouteQueue {
  /** Whose ship sails it. */
  readonly player: string;
  /** Steps not yet sent, in order. */
  readonly remaining: readonly Hex[];
  /** The step sent and not yet seen applied, with the moves used when it was sent. */
  readonly awaiting: { readonly hex: Hex; readonly movesUsed: number } | null;
}

/** What the board shows after an update, as the queue needs it. */
export interface RouteObservation {
  readonly player: string;
  readonly phase: string;
  readonly inCombat: boolean;
  readonly gameOver: boolean;
  /** Where the sailing player's ship is. */
  readonly position: Hex;
  /** Moves used this turn (`G.movesUsed`; port actions are free, #227). */
  readonly movesUsed: number;
  readonly movesLeft: number;
  /** The hexes the ship can move to from where it is (`validMoveTargets`). */
  readonly openSteps: readonly Hex[];
  /** Whether the ship is on a port's docking hex. */
  readonly atDockingHex: boolean;
}

export type RouteAdvance =
  | { readonly kind: "send"; readonly hex: Hex; readonly queue: RouteQueue }
  | { readonly kind: "wait"; readonly queue: RouteQueue }
  | { readonly kind: "done"; readonly reason: "arrived" | "rejected" | "interrupted" };

/** A queue to sail `route` (the hexes after the ship's, in order) for `player`. */
export const startRoute = (route: readonly Hex[], player: string): RouteQueue => ({
  player,
  remaining: route,
  awaiting: null,
});

/** The next thing to do for `queue`, given what the board shows now. */
export function advanceRoute(queue: RouteQueue, obs: RouteObservation, wrap: MapWrap): RouteAdvance {
  if (obs.gameOver || obs.player !== queue.player || obs.phase !== "main" || obs.inCombat) {
    return { kind: "done", reason: "interrupted" };
  }
  const { awaiting } = queue;
  if (awaiting) {
    if (!wrappedEquals(obs.position, awaiting.hex, wrap)) {
      // Not there yet; but if a move was used all the same, the ship went elsewhere
      return obs.movesUsed === awaiting.movesUsed ? { kind: "wait", queue } : { kind: "done", reason: "interrupted" };
    }
    if (queue.remaining.length > 0 && obs.atDockingHex) return { kind: "done", reason: "interrupted" };
  }
  const [next, ...rest] = queue.remaining;
  if (!next) return { kind: "done", reason: "arrived" };
  if (obs.movesLeft <= 0) return { kind: "done", reason: "interrupted" };
  if (!obs.openSteps.some((h) => wrappedEquals(h, next, wrap))) return { kind: "done", reason: "rejected" };
  return {
    kind: "send",
    hex: next,
    queue: { player: queue.player, remaining: rest, awaiting: { hex: next, movesUsed: obs.movesUsed } },
  };
}

/** The turn as boardgame.io's `ctx` gives it. */
export interface TurnContext {
  readonly currentPlayer: string;
  readonly phase: string;
  readonly gameover?: unknown;
}

/**
 * What the queue sees of `G` for `player`'s route: where their ship is, the
 * moves left and the hexes open to it (other players' ships and the NPCs
 * block, as on the board). Undefined once their ship is gone.
 */
export function routeObservation(G: CaribbeanState, ctx: TurnContext, player: string): RouteObservation | undefined {
  const ship = G.ships[player];
  if (!ship) return undefined;
  const occupied = [
    ...Object.entries(G.ships)
      .filter(([id]) => id !== player)
      .map(([, s]) => s.position),
    ...Object.values(G.npcs).map((n) => n.position),
  ];
  return {
    player: ctx.currentPlayer,
    phase: ctx.phase,
    inCombat: G.combat !== undefined && G.combat !== null,
    gameOver: ctx.gameover !== undefined && ctx.gameover !== null,
    position: ship.position,
    movesUsed: movesUsed(G),
    movesLeft: movesLeft(G, player),
    openSteps: validMoveTargets(ship.position, G.cells, G.wrap, occupied, ship.stats?.shallowDraft ?? true),
    atDockingHex: findAccessiblePort(ship.position, G.cells, G.wrap) !== undefined,
  };
}
