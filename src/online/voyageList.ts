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
import { matchPath, roomPath } from "./onlineRoute";
import type { VoyageView } from "./roomApi";

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

/** "2 captains, small map.", led by "Drafting captains" while the draft is on. No round: the server does not keep one. */
function matchLine(voyage: VoyageView): string {
  return `${voyage.drafting ? "Drafting captains, " : ""}${voyage.seatCount} captains, ${voyage.mapSize} map.`;
}

/** Who the match waits on: in the draft every captain yet to pick (#111), else the seat whose turn it is, if known. */
function waitingOnNames(voyage: VoyageView): string[] {
  const seats = voyage.drafting ? voyage.choosing : voyage.currentSeat === null ? [] : [voyage.currentSeat];
  return seats.map((index) => voyage.seats.find((s) => s.index === index)?.displayName ?? UNNAMED);
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
    const waitingOn = waitingOnNames(voyage);
    return { ...base, line: waitingOn.length === 0 ? matchLine(voyage) : `${matchLine(voyage)} Waiting on ${list(waitingOn)}.`, link: open };
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
