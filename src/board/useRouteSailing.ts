import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Hex } from "../game/hex";
import type { CaribbeanState } from "../game/types";
import {
  advanceRoute,
  routeObservation,
  startRoute,
  STEP_TIMEOUT_MS,
  type RouteObservation,
  type RouteQueue,
  type TurnContext,
} from "./routeQueue";

/**
 * Sails a planned route (#213) one `moveShip` per hex: the first step at
 * once, each next one two frames after the board shows the last applied (so
 * every hex reaches the ship's motion on a frame of its own and the course
 * chains through it), until the route ends, a step would be refused, or
 * something interrupts it (routeQueue.ts). A step unapplied after
 * STEP_TIMEOUT_MS is taken as refused.
 */
export function useRouteSailing(
  G: CaribbeanState,
  ctx: TurnContext,
  moveShip: (q: number, r: number) => void,
): { sailing: boolean; sail: (route: Hex[]) => void } {
  const [sailing, setSailing] = useState(false);
  const queue = useRef<RouteQueue | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { currentPlayer, phase, numMoves, gameover } = ctx;
  const observation = useMemo(
    () => routeObservation(G, { currentPlayer, phase, numMoves, gameover }, currentPlayer),
    [G, currentPlayer, phase, numMoves, gameover],
  );
  const seen = useRef<RouteObservation | undefined>(observation);
  const wrap = G.wrap;

  const stop = useCallback(() => {
    queue.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSailing(false);
  }, []);

  const advance = useCallback(() => {
    const q = queue.current;
    if (!q) return;
    const obs = seen.current;
    // The sailing player's ship is gone: nothing more to sail
    const next = obs && obs.player === q.player ? advanceRoute(q, obs, wrap) : ({ kind: "done" } as const);
    if (next.kind === "done") return stop();
    queue.current = next.queue;
    if (next.kind === "wait") return;
    const awaiting = next.queue.awaiting;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (queue.current?.awaiting === awaiting) stop();
    }, STEP_TIMEOUT_MS);
    moveShip(next.hex.q, next.hex.r);
  }, [moveShip, stop, wrap]);

  // After every update, look again two frames on
  useEffect(() => {
    seen.current = observation;
    if (!queue.current) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(advance);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [observation, advance]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const sail = useCallback(
    (route: Hex[]) => {
      if (queue.current || route.length === 0) return;
      queue.current = startRoute(route, currentPlayer);
      setSailing(true);
      advance();
    },
    [advance, currentPlayer],
  );

  return { sailing, sail };
}
