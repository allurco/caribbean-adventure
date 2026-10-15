/**
 * "Your voyages" (#301): the signed-in player's rooms and matches (`GET
 * /api/me/rooms`) as the harbour shows them, after the online shell's Play
 * screen (#125): the match waiting on the player leads, with Take your turn;
 * then the other voyages, each with its way in. Pure; `YourVoyages.tsx`
 * draws it, and #125's Play sheet is meant to host that component as it is.
 *
 * Only what the server knows is said: no hours left (#115), glory or ranked
 * (#120) until it does.
 */
import type { MapSizeId } from "../game/mapConfig";
import { matchPath, roomPath } from "./onlineRoute";

/** A voyage as the server sends it (`voyageView` in server/voyages.ts). */
export interface VoyageView {
  roomId: string;
  matchId: string | null;
  status: "open" | "starting" | "started" | "finished";
  seatCount: number;
  mapSize: MapSizeId;
  seats: { index: number; displayName: string | null }[];
  yourSeat: number;
  /** Whose turn it is in a match under way; null otherwise. */
  currentSeat: number | null;
  /** boardgame.io's turn number in a match under way; null otherwise. */
  turn: number | null;
  yourTurn: boolean;
  updatedAt: string;
}

export interface VoyageLink {
  href: string;
  label: string;
}

/** The match waiting on the player, at the head of the harbour. */
export interface LeadVoyage {
  roomId: string;
  /** Its captains, by name: rooms have no names of their own yet. */
  name: string;
  line: string;
  link: VoyageLink;
}

export interface VoyageEntry extends LeadVoyage {
  /** The player's turn: its line is inked in wax red. */
  yourTurn: boolean;
}

export interface HarbourVoyages {
  lead: LeadVoyage | null;
  others: VoyageEntry[];
}

const UNNAMED = "a captain";

function list(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function nameOf(voyage: VoyageView): string {
  return capitalised(list(voyage.seats.map((s) => s.displayName ?? UNNAMED)));
}

/** A round is every seat's turn once: turn 1 and 2 of two seats are round 1. */
function roundOf(voyage: VoyageView): number | null {
  return voyage.turn === null ? null : Math.ceil(voyage.turn / voyage.seatCount);
}

/** "Round 3, 2 captains, small map." */
function matchLine(voyage: VoyageView): string {
  const round = roundOf(voyage);
  return `${round === null ? "" : `Round ${round}, `}${voyage.seatCount} captains, ${voyage.mapSize} map.`;
}

function isUnderWay(voyage: VoyageView): voyage is VoyageView & { matchId: string } {
  return voyage.status === "started" && voyage.matchId !== null;
}

function entry(voyage: VoyageView): VoyageEntry {
  const base = { roomId: voyage.roomId, name: nameOf(voyage), yourTurn: false };
  const lobby = { href: roomPath(voyage.roomId), label: "Lobby" };
  if (isUnderWay(voyage)) {
    const open = { href: matchPath(voyage.matchId), label: "Open" };
    if (voyage.yourTurn) return { ...base, yourTurn: true, line: `${matchLine(voyage)} Your turn.`, link: open };
    const waitingOn = voyage.currentSeat === null ? null : voyage.seats.find((s) => s.index === voyage.currentSeat)?.displayName ?? UNNAMED;
    return { ...base, line: waitingOn === null ? matchLine(voyage) : `${matchLine(voyage)} Waiting on ${waitingOn}.`, link: open };
  }
  if (voyage.status === "finished") {
    const view = voyage.matchId ? { href: matchPath(voyage.matchId), label: "View" } : lobby;
    return { ...base, line: `Finished, ${voyage.seatCount} captains, ${voyage.mapSize} map.`, link: view };
  }
  if (voyage.status === "open") {
    return { ...base, line: `In the lobby: ${voyage.seats.length} of ${voyage.seatCount} captains aboard, ${voyage.mapSize} map.`, link: lobby };
  }
  return { ...base, line: `The match is being started, ${voyage.mapSize} map.`, link: lobby };
}

/** Under way first (the player's turns before the rest), then waiting in the lobby, then finished. */
function rank(voyage: VoyageView): number {
  if (isUnderWay(voyage)) return voyage.yourTurn ? 0 : 1;
  return voyage.status === "finished" ? 3 : 2;
}

/**
 * The harbour's voyages: the most recent match waiting on the player leads;
 * the others follow by `rank`, each group in the server's order (most
 * recently changed first).
 */
export function harbourVoyages(voyages: readonly VoyageView[]): HarbourVoyages {
  const ordered = voyages.map((v, i) => ({ v, i })).sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i).map(({ v }) => v);
  const head = ordered[0];
  const leads = head !== undefined && isUnderWay(head) && head.yourTurn;
  const lead = leads
    ? { roomId: head.roomId, name: nameOf(head), line: matchLine(head), link: { href: matchPath(head.matchId), label: "Take your turn" } }
    : null;
  return { lead, others: (leads ? ordered.slice(1) : ordered).map(entry) };
}
