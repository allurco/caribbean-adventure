import type { Handoff } from "./turnHandoff";
import type { Captain, CaribbeanState, CombatState } from "../game/types";

/**
 * Which seat the board is for, and what that seat may do (#110). A client
 * holds a seat (`playerID`) in networked play, or in the local multi-seat
 * view (several seats on one page); the hotseat client holds none and is one
 * screen every seat shares, so it always shows and acts for whoever's turn
 * it is. Pure: the board reads these, the components only lay them out.
 */

/** The client's seat (`playerID`, null or undefined in hotseat) and whose turn it is. */
export interface SeatTurn {
  playerID?: string | null;
  currentPlayer: string;
}

/** The board may make moves now: always in hotseat, else only on the seat's own turn. */
export function seatMayAct({ playerID, currentPlayer }: SeatTurn): boolean {
  return playerID == null || playerID === currentPlayer;
}

/**
 * The seat whose ship, gold and hand the HUD shows. A seat sees its own,
 * always: a rival's purse and hold reach it emptied (`playerView`, #109),
 * so showing a rival's ship would read as zeros. Hotseat shows the current
 * player's, but keeps the outgoing captain's until the next turn is
 * announced (#216), unless that ship is gone.
 */
export function hudSeat({
  playerID,
  currentPlayer,
  handoff,
  ships,
}: SeatTurn & { handoff: Handoff | null; ships: Readonly<Record<string, unknown>> }): string {
  if (playerID != null) return playerID;
  const handingOff = handoff !== null && handoff.phase !== "nextTurn" && handoff.phase !== "idle";
  return handingOff && ships[handoff.from] ? handoff.from : currentPlayer;
}

/** What the board calls a seat: its captain, or "Player n" (counting from 1) before it has one. */
export function seatName(G: Pick<CaribbeanState, "ships">, seat: string): string {
  return G.ships[seat]?.captain?.name ?? `Player ${Number(seat) + 1}`;
}

/** The line a seat sees on another seat's turn, "Waiting for <captain>"; null when it may act. */
export function waitingFor(G: Pick<CaribbeanState, "ships">, turn: SeatTurn): string | null {
  return seatMayAct(turn) ? null : `Waiting for ${seatName(G, turn.currentPlayer)}`;
}

/**
 * What the draft screen shows: the hand to pick from (and, in hotseat, the
 * "pass the helm" screen after the pick), or a line to wait on. A seat never
 * sees another seat's hand: it reaches the seat emptied (`playerView`, #109).
 */
export type DraftView =
  | { kind: "pick"; hand: Captain[]; passDevice: boolean }
  | { kind: "waiting"; line: string };

export function draftView(G: Pick<CaribbeanState, "ships" | "draftHands">, turn: SeatTurn): DraftView {
  if (!seatMayAct(turn)) return { kind: "waiting", line: `Waiting for ${seatName(G, turn.currentPlayer)} to draft` };
  const hand = G.draftHands[turn.currentPlayer] ?? [];
  if (hand.length === 0) return { kind: "waiting", line: "Waiting for other players..." };
  return { kind: "pick", hand, passDevice: turn.playerID == null };
}

/**
 * May this client act in the fight on now? Hotseat always; a seat when its
 * ship is in it, attacking or attacked. Everyone else watches.
 */
export function seatMayActInCombat(
  playerID: string | null | undefined,
  combat: Pick<CombatState, "attackerId" | "defenderId" | "isNPCCombat">
): boolean {
  if (playerID == null) return true;
  return playerID === combat.attackerId || (!combat.isNPCCombat && playerID === combat.defenderId);
}

/** One line of the glory scoreboard. */
export interface GloryRow {
  seat: string;
  name: string;
  glory: number;
  /** The seat the board is for. */
  viewer: boolean;
}

/**
 * Every seat's captain and glory, most glory first and ties in seat order.
 * Glory (`score`) is public (#109); purses and holds are not, so they are
 * not on it.
 */
export function gloryScoreboard(G: Pick<CaribbeanState, "ships">, viewer: string): GloryRow[] {
  return Object.entries(G.ships)
    .map(([seat, ship]) => ({ seat, name: seatName(G, seat), glory: ship.score, viewer: seat === viewer }))
    .sort((a, b) => b.glory - a.glory || Number(a.seat) - Number(b.seat));
}
