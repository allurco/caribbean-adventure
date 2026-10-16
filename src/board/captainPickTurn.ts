/**
 * A new captain's turn on the board (#265, #286), pure. When the turn passes
 * to a seat that lost its ship, the captain screen comes up at once, so the
 * outgoing captain's "turn ends" beat is not drawn over it; the hand-off
 * reaches the seat with no ship to announce, so the turn opens only after
 * the pick: the "Your turn" banner, and the camera to the new ship at its
 * home port (`newCaptainView` in shipView.ts). A pick that lands before the
 * hand-off announces the turn is left to the hand-off, which then finds the
 * ship. Nothing here touches `G`.
 */
import { awaitingCaptain } from "../game/captainDeath";
import type { CaribbeanState } from "../game/types";
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

/**
 * Whether `player`'s turn opens (announced, the camera to their ship) as the
 * hand-off reaches it: not while they are still to pick a new captain, whose
 * turn opens after the pick (`captainPicked`), nor for a seat out
 * of the game, which has no ship to show.
 */
export function turnOpensOnArrival(G: Pick<CaribbeanState, "lostShips">, player: string): boolean {
  return G.lostShips?.[player] === undefined;
}

/** The seat at the helm as the board last showed it: whose turn, which, and whether they are choosing a new captain. */
export interface Helm {
  readonly player: string;
  readonly turn: number;
  readonly choosing: boolean;
}

/** The helm now: `choosing` only in the main phase, for a seat awaiting a new captain (the draft opens the game its own way). */
export function helmOf(G: Pick<CaribbeanState, "lostShips">, phase: string | null, player: string, turn: number): Helm {
  return { player, turn, choosing: phase === "main" && awaitingCaptain(G, player) };
}

/**
 * What a new captain's pick does to the turn: `none` without a pick (the
 * seat choosing a captain picked, within the same turn); `opensNow` when the
 * hand-off has nothing left to announce (it has reached the turn, or there
 * is none), so the board opens the turn itself; `atHandoff` when the hand-off
 * is still to announce the turn, and opens it then, the new ship on the
 * board, flying the camera to it as `newCaptainView` does.
 */
export type CaptainPick = "none" | "opensNow" | "atHandoff";

export function captainPicked(before: Helm | null, now: Helm, handoff: Handoff | null): CaptainPick {
  if (before === null || !before.choosing || now.choosing) return "none";
  if (before.player !== now.player || before.turn !== now.turn) return "none";
  return announcementToCome(handoff) ? "atHandoff" : "opensNow";
}

/** Whether a hand-off is still to announce its turn. */
const announcementToCome = (h: Handoff | null): boolean =>
  h !== null && (h.phase === "sailing" || h.phase === "turnEnded" || h.phase === "npcs");
