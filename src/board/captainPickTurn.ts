/**
 * When a turn opens on the board (#216, #286), pure: the "Your turn" banner
 * and the camera to the new ship. A plain turn opens as the hand-off
 * announces it. A seat that lost its ship (#265) has no ship to show then:
 * the captain screen comes up at once (and the outgoing captain's "turn
 * ends" beat is not drawn over it), and the turn opens after the pick, once
 * the hand-off has nothing left to announce, the camera flying to the new
 * ship at its home port. Every decision is taken from what the board renders
 * (the helm, the hand-off's phase), never from copies a frame callback reads,
 * so a pick that lands just as the hand-off announces is never lost. Nothing
 * here touches `G`.
 */
import { awaitingCaptain } from "../game/captainDeath";
import type { CaribbeanState } from "../game/types";
import { newCaptainView, turnChangeView, type CameraView, type ShipViewInput } from "./shipView";
import type { Handoff } from "./turnHandoff";

/**
 * Whether the outgoing captain's "turn ends" banner shows: through the
 * hand-off's beat, while the outgoing ship is on the board, and never over
 * the captain screen (`captainScreenUp`, `choosingCaptain` in seat.ts).
 */
export function turnEndedBannerShows(
  handoff: Handoff | null,
  ships: Readonly<Record<string, unknown>>,
  captainScreenUp: boolean,
): boolean {
  return handoff?.phase === "turnEnded" && handoff.from in ships && !captainScreenUp;
}

/** A turn: whose, and boardgame.io's turn number. */
export interface TurnOf {
  readonly player: string;
  readonly turn: number;
}

/** The seat at the helm as the board shows it: whose turn, which, and whether they are choosing a new captain. */
export interface Helm extends TurnOf {
  readonly choosing: boolean;
}

/** The helm now: `choosing` only in the main phase, for a seat awaiting a new captain (the draft opens the game its own way). */
export function helmOf(G: Pick<CaribbeanState, "lostShips">, phase: string | null, player: string, turn: number): Helm {
  return { player, turn, choosing: phase === "main" && awaitingCaptain(G, player) };
}

/** Whether the helm the board last saw (`before`) is out of date. */
export const helmChanged = (before: Helm | null, now: Helm): boolean =>
  before === null || before.player !== now.player || before.turn !== now.turn || before.choosing !== now.choosing;

/** Whether the seat choosing a new captain has picked, within the same turn. */
export function captainPicked(before: Helm | null, now: Helm): boolean {
  if (before === null || !before.choosing || now.choosing) return false;
  return before.player === now.player && before.turn === now.turn;
}

/** The turns waiting to open: the one the hand-off announced, and a new captain's, picked. */
export interface PendingOpen {
  readonly announced: string | null;
  readonly newCaptain: TurnOf | null;
}

/** What to do with the pending turns now: nothing yet, let them go, or open one (as a new captain's or not). */
export type OpenStep =
  | { readonly kind: "none" }
  /** Let one pending turn go (the other is looked at on the next render). */
  | { readonly kind: "drop"; readonly which: keyof PendingOpen }
  | { readonly kind: "open"; readonly player: string; readonly newCaptain: boolean };

/**
 * The next step for the pending turns, given the helm and the hand-off. A
 * new captain's turn waits while the hand-off is still to announce (it then
 * opens once, the announcement taken with it), and opens as soon as there
 * is nothing left to announce: the hand-off reached the turn, timed out, or
 * there is none. An announced turn opens at once, but for a seat still to
 * pick a captain, whose pick opens it. Either is dropped once its turn is
 * no longer the helm's.
 */
export function nextOpening(pending: PendingOpen, now: Helm, handoff: Handoff | null): OpenStep {
  const { announced, newCaptain } = pending;
  if (newCaptain !== null) {
    if (newCaptain.player !== now.player || newCaptain.turn !== now.turn) return { kind: "drop", which: "newCaptain" };
    if (announcementToCome(handoff)) return { kind: "none" };
    return { kind: "open", player: newCaptain.player, newCaptain: true };
  }
  if (announced === null) return { kind: "none" };
  if (announced !== now.player || now.choosing) return { kind: "drop", which: "announced" };
  return { kind: "open", player: announced, newCaptain: false };
}

/**
 * Where the camera goes as a turn opens: a new captain's turn flies the seat
 * that picked to its new ship (`newCaptainView`), a plain turn flies only a
 * hotseat camera (`turnChangeView`). Null to stay put.
 */
export const openingTurnView = (input: ShipViewInput, newCaptain: boolean): CameraView | null =>
  newCaptain ? newCaptainView(input) : turnChangeView(input);

/** Whether a hand-off is still to announce its turn. */
const announcementToCome = (h: Handoff | null): boolean =>
  h !== null && (h.phase === "sailing" || h.phase === "turnEnded" || h.phase === "npcs");
