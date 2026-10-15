import { useCallback, useEffect, useRef, useState } from "react";
import type { NPCShip } from "../game/types";
import { heldNpcsFor, startHandoff, stepHandoff, turnPassed, type Handoff, type ShownTurn } from "./turnHandoff";

/**
 * Plays the hand-off between turns (turnHandoff.ts, #216) each frame from
 * what the board reports: which ships are under way, and when the next
 * turn's announcement is done. It starts in the very render the turn
 * passes, keeping the NPCs as they stood before, so the board never draws
 * them at their new hexes early; and calls `onNextTurn` as the next turn is
 * to be announced.
 */
export function useTurnHandoff({
  currentPlayer,
  turn,
  fight,
  active,
  reducedMotion,
  npcs,
  underway,
  onNextTurn,
}: {
  currentPlayer: string;
  /** boardgame.io's turn number: a new one hands off even to the same seat (solo, #278). */
  turn: number;
  /** A fight is under way: played within the attacker's turn, it hands off only when it ends (#284). */
  fight: boolean;
  /** Turns are being played (not the draft). */
  active: boolean;
  reducedMotion: boolean;
  npcs: Record<string, NPCShip>;
  /** Which ships (players' and NPCs', by id) are under way. */
  underway: Record<string, boolean>;
  onNextTurn: (player: string) => void;
}): { handoff: Handoff | null; heldNpcs: Record<string, NPCShip> | null; markTurnShown: () => void } {
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [heldNpcs, setHeldNpcs] = useState<Record<string, NPCShip> | null>(null);
  // The turn the board last showed, and the NPCs as it last showed them
  const [turnOf, setTurnOf] = useState<ShownTurn | null>(active ? { player: currentPlayer, turn } : null);
  const [lastNpcs, setLastNpcs] = useState(npcs);

  // State adjusted while rendering (React's pattern for a changed prop), so
  // the hand-off holds from the first render of the new turn
  if (!active && turnOf !== null) setTurnOf(null);
  if (active && (turnOf === null || turnPassed(turnOf, { player: currentPlayer, turn, fight }))) {
    setTurnOf({ player: currentPlayer, turn });
    if (turnOf !== null) {
      setHandoff(startHandoff(turnOf.player, currentPlayer, null, reducedMotion));
      setHeldNpcs(heldNpcsFor(lastNpcs, npcs, turnOf, { player: currentPlayer, turn }));
    }
  }
  if (lastNpcs !== npcs) setLastNpcs(npcs);

  const current = useRef(handoff);
  const seen = useRef({ underway, npcs, onNextTurn });
  const turnShown = useRef(false);
  useEffect(() => {
    // A hand-off just started: its announcement is still to come
    if (handoff?.startedAt === null) turnShown.current = false;
    current.current = handoff;
  }, [handoff]);
  useEffect(() => {
    seen.current = { underway, npcs, onNextTurn };
  });

  // Each frame while it runs, step it on
  const running = handoff !== null && handoff.phase !== "idle";
  useEffect(() => {
    if (!running) return;
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick);
      const h = current.current;
      if (!h) return;
      const { underway: u, npcs: n } = seen.current;
      const next = stepHandoff(h, {
        now: performance.now(),
        shipAtRest: !u[h.from],
        npcsAtRest: Object.keys(n).every((id) => !u[id]),
        turnShown: turnShown.current,
      });
      if (next === h) return;
      current.current = next;
      setHandoff(next);
      if (next.phase === "nextTurn" && h.phase !== "nextTurn") seen.current.onNextTurn(next.to);
    });
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const markTurnShown = useCallback(() => {
    turnShown.current = true;
  }, []);

  return { handoff, heldNpcs, markTurnShown };
}
