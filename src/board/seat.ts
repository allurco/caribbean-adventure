import type { Handoff } from "./turnHandoff";
import type { Captain, CaribbeanState, CombatStage, ShipState } from "../game/types";
import { awaitingCaptain, isEliminated } from "../game/captainDeath";
import { npcName } from "./npcName";
import { combatActor, seatMayActInCombat, type FightSides, type FightStep, type SeatFight } from "../game/combatActor";

export { combatActor, seatMayActInCombat, type FightSides, type FightStep, type SeatFight };

/**
 * Which seat the board is for, and what that seat may do (#110). A client
 * holds a seat (`playerID`) in networked play, or in the local multi-seat
 * view (several seats on one page); the hotseat client holds none and is one
 * screen every seat shares, so it always shows and acts for whoever's turn
 * it is. Pure: the board reads these, the components only lay them out.
 *
 * These rules mirror the engine's for the board: they decide which controls
 * a seat is offered, and do not replace the engine's own enforcement of who
 * may move (boardgame.io's turn order today; the server, #104).
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

/** Whose ship the board treats as the viewer's own (hover, ship details, port, scouting): the seat's, or in hotseat the current player's. */
export function viewerSeat({ playerID, currentPlayer }: SeatTurn): string {
  return playerID ?? currentPlayer;
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

/**
 * The ship the HUD shows for its seat (`hudSeat`), or null when that ship is
 * gone: a sunk ship is deleted from `G.ships`, and the HUD then shows the
 * loss, never another seat's ship in its place (a rival's reaches it emptied).
 */
export function hudShip(G: Pick<CaribbeanState, "ships">, seat: string): ShipState | null {
  return G.ships[seat] ?? null;
}

/** What the board calls a seat: its captain, or "Player n" (counting from 1) before it has one. */
export function seatName(G: Pick<CaribbeanState, "ships">, seat: string): string {
  return G.ships[seat]?.captain?.name ?? `Player ${Number(seat) + 1}`;
}

/** "Waiting for <captain>", and what for when given ("to draft"): every waiting line on the board. */
function waitingLine(G: Pick<CaribbeanState, "ships">, seat: string, what?: string): string {
  return `Waiting for ${seatName(G, seat)}${what ? ` ${what}` : ""}`;
}

/** The line a seat sees on another seat's turn, "Waiting for <captain>"; null when it may act. */
export function waitingFor(G: Pick<CaribbeanState, "ships">, turn: SeatTurn): string | null {
  return seatMayAct(turn) ? null : waitingLine(G, turn.currentPlayer);
}

/**
 * Whether the captain screen (`DraftScreen`) is up: through the draft, and
 * in the main phase while the current seat, whose ship was lost, has yet to
 * pick a new captain (#265).
 */
export function choosingCaptain(G: Pick<CaribbeanState, "lostShips">, phase: string, currentPlayer: string): boolean {
  return phase === "draft" || (phase === "main" && awaitingCaptain(G, currentPlayer));
}

/**
 * What the draft screen shows: the hand to pick from (and, in hotseat, the
 * "pass the helm" screen after the pick), or a line to wait on. A seat never
 * sees another seat's hand: it reaches the seat emptied (`playerView`, #109).
 * A new captain for a lost ship (#265) is picked the same way, but the seat
 * then sails its turn, so there is no device to pass.
 */
export type DraftView =
  | { kind: "pick"; hand: Captain[]; passDevice: boolean }
  | { kind: "waiting"; line: string };

export function draftView(G: Pick<CaribbeanState, "ships" | "draftHands" | "lostShips">, turn: SeatTurn): DraftView {
  const replacing = awaitingCaptain(G, turn.currentPlayer);
  if (!seatMayAct(turn)) {
    return { kind: "waiting", line: waitingLine(G, turn.currentPlayer, replacing ? "to pick a new captain" : "to draft") };
  }
  const hand = G.draftHands[turn.currentPlayer] ?? [];
  if (hand.length === 0) return { kind: "waiting", line: "Waiting for other players..." };
  return { kind: "pick", hand, passDevice: turn.playerID == null && !replacing };
}

const STEP_WAITED_ON: Record<CombatStage, string> = {
  seamanship: "to roll for seamanship",
  chooseAction: "to choose",
  fleeAttempt: "to roll the pursuit",
  cannons: "to fire",
  resolution: "to apply the damage",
};

/** The line a seat sees while another presses the fight's step ("Waiting for <captain> to choose"); null when it presses. */
export function combatWaitingFor(G: Pick<CaribbeanState, "ships">, fight: SeatFight): string | null {
  if (seatMayActInCombat(fight)) return null;
  return waitingLine(G, combatActor(fight.combat), STEP_WAITED_ON[fight.combat.stage]);
}

/** One line of the glory scoreboard. */
export interface GloryRow {
  seat: string;
  name: string;
  glory: number;
  /** The seat the board is for. */
  viewer: boolean;
  /** Out of the game: its ship lost with no captain left to deal (#265). */
  out: boolean;
}

/**
 * Every seat's captain and glory, most glory first and ties in seat order.
 * Glory (`score`) is public (#109); purses and holds are not, so they are
 * not on it. A seat whose ship was lost keeps its glory on the board until
 * its new captain sails, and for good, marked out, once it is out of the
 * game (#265).
 */
export function gloryScoreboard(G: Pick<CaribbeanState, "ships" | "lostShips">, viewer: string): GloryRow[] {
  const glory = [
    ...Object.entries(G.ships).map(([seat, ship]) => [seat, ship.score] as const),
    ...Object.entries(G.lostShips ?? {}).map(([seat, lost]) => [seat, lost.score] as const),
  ];
  return glory
    .map(([seat, score]) => ({
      seat,
      name: seatName(G, seat),
      glory: score,
      viewer: seat === viewer,
      out: isEliminated(G, seat),
    }))
    .sort((a, b) => b.glory - a.glory || Number(a.seat) - Number(b.seat));
}

/** A seat with no ship in the fight (hotseat never is one): it sees `fightWatched` over it. */
export function fightBystander(playerID: string | null | undefined, combat: FightSides): boolean {
  return playerID != null && playerID !== combat.attackerId && playerID !== combat.defenderId;
}

/** What the board calls a fight's defender: its captain, or an NPC by role and nation (`npcName`). */
export function defenderName(G: Pick<CaribbeanState, "ships" | "npcs">, combat: FightSides): string {
  if (!combat.isNPCCombat) return seatName(G, combat.defenderId);
  const npc = G.npcs[combat.defenderId];
  return npc ? npcName(npc) : "a ship";
}

/** The line a seat watching someone else's fight sees: who is fighting whom (an NPC as the combat panel names it). */
export function fightWatched(G: Pick<CaribbeanState, "ships" | "npcs">, combat: FightSides): string {
  const defender = defenderName(G, combat);
  return `${seatName(G, combat.attackerId)} is fighting ${defender}`;
}
