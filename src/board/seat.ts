import type { Handoff } from "./turnHandoff";
import type { Captain, CaribbeanState, CombatStage, ShipState } from "../game/types";
import { awaitingCaptain, isEliminated } from "../game/captainDeath";
import { hasPicked } from "../game/draftOrder";
import { listNames } from "../game/listNames";
import { seatLabel } from "../game/seats";
import { npcName } from "./npcName";
import { combatActor, seatMayActInCombat, type FightSides, type FightStep, type SeatFight } from "../game/combatActor";

/** "Player n", also how the draft names the other seats, whose captains stay hidden until it ends (#111). */
export { seatLabel };
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

/**
 * Whether this is the seatless hotseat board: no seat (`playerID`) and more
 * than one captain at the one screen. A solo game has no seat either, but
 * no other captain to hand the board to.
 */
export function isHotseatBoard(playerID: string | null | undefined, numPlayers: number): boolean {
  return playerID == null && numPlayers > 1;
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
  return G.ships[seat]?.captain?.name ?? seatLabel(seat);
}

/**
 * Whose turn an event log row came on (#246, #372): the seat's captain, or,
 * once its ship is lost, the captain who went down with it, so the seat's
 * earlier rows keep their name through the loss; "Player n" with neither.
 * Not for the waiting lines, which never name a dead captain.
 */
export function turnCaptainName(G: Pick<CaribbeanState, "ships" | "lostShips">, seat: string): string {
  return G.ships[seat]?.captain?.name ?? G.lostShips?.[seat]?.captain?.name ?? seatLabel(seat);
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
 * A client holding a seat drafts at once with every other (#111): it picks
 * from its own hand whoever's turn it is, then waits on the seats still
 * choosing, and sees every other seat as picked or still choosing (`others`).
 * A new captain for a lost ship (#265) is picked on the seat's own turn, but
 * the seat then sails its turn, so there is no device to pass.
 */
export type DraftView =
  | { kind: "pick"; hand: Captain[]; passDevice: boolean; others?: DraftSeat[] }
  | { kind: "waiting"; line: string; others?: DraftSeat[] };

/** Another seat in the draft, as a seat sees it: picked or still choosing, named by its number, never its captain (#111). */
export interface DraftSeat {
  seat: string;
  name: string;
  picked: boolean;
}

/** The draft as a seat's own client sees it: every seat at once (#111). */
function seatDraftView(G: Pick<CaribbeanState, "ships" | "draftHands">, seat: string): DraftView {
  const others = Object.keys(G.ships)
    .filter((other) => other !== seat)
    .map((other) => ({ seat: other, name: seatLabel(other), picked: hasPicked(G, other) }));
  if (!hasPicked(G, seat)) return { kind: "pick", hand: G.draftHands[seat] ?? [], passDevice: false, others };
  const choosing = others.filter((other) => !other.picked).map((other) => other.name);
  const what = choosing.length === 1 ? "to choose a captain" : "to choose their captains";
  return { kind: "waiting", line: `Waiting for ${listNames(choosing)} ${what}`, others };
}

export function draftView(G: Pick<CaribbeanState, "ships" | "draftHands" | "lostShips">, turn: SeatTurn): DraftView {
  const replacing = awaitingCaptain(G, turn.currentPlayer);
  if (turn.playerID != null && !replacing) return seatDraftView(G, turn.playerID);
  if (!seatMayAct(turn)) {
    return { kind: "waiting", line: waitingLine(G, turn.currentPlayer, replacing ? "to pick a new captain" : "to draft") };
  }
  const hand = G.draftHands[turn.currentPlayer] ?? [];
  if (hand.length === 0) return { kind: "waiting", line: "Waiting for other players..." };
  return { kind: "pick", hand, passDevice: turn.playerID == null && !replacing };
}

const STEP_WAITED_ON: Record<CombatStage, string> = {
  seamanship: "to roll for seamanship",
  // Each captain rolls its own die of the draw (#347): the defender's, after the attacker's.
  defenderSeamanship: "to roll for seamanship",
  chooseAction: "to choose",
  fleeAttempt: "to roll the pursuit",
  // Every volley is its firing ship's step (#348), the answer included
  cannons: "to fire",
  returnFire: "to fire",
  // The crew fight (#350) is the boarder's step
  boarding: "to board",
  // The round settles itself (#380): only a fight stored at the resolution before then waits on it.
  resolution: "to end the round",
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
  /** Whether the server saw the seat read or move lately (#114): only in an online match. */
  online?: boolean;
}

/**
 * Every seat's captain and glory, most glory first and ties in seat order.
 * Glory (`score`) is public (#109); purses and holds are not, so they are
 * not on it. A seat whose ship was lost keeps its glory on the board until
 * its new captain sails, and for good, marked out, once it is out of the
 * game (#265). `onlineSeats`, in an online match, marks the seats the server
 * saw read or move within the last minute (#114); hotseat and solo pass
 * none, and the rows then say nothing of it.
 */
export function gloryScoreboard(
  G: Pick<CaribbeanState, "ships" | "lostShips">,
  viewer: string,
  onlineSeats?: readonly string[] | null,
): GloryRow[] {
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
      ...(onlineSeats != null && { online: onlineSeats.includes(seat) }),
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
