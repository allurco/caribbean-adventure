/**
 * What `/api` needs from the database (#112), as a narrow port: the Supabase
 * implementation (`supabaseOnlineStore.ts`, service role, the SQL functions of
 * `supabase/migrations/*_rooms.sql`) in production, and an in-memory one
 * (`memoryOnlineStore.ts`) in the route tests. Every operation that must not
 * race (taking a seat, starting a match) is one call, atomic in the database.
 */
import type { MapSizeId } from "../src/game/mapConfig";

/** `starting`: the host's start is claimed and the match is being built (#112). */
export type RoomStatus = "open" | "starting" | "started" | "finished";

export interface NewRoom {
  hostId: string;
  inviteCode: string;
  seatCount: number;
  mapSize: MapSizeId;
  mapSeed: number;
  turnTimerSeconds: number;
}

export interface SeatRecord {
  /** The seat's index, which is its boardgame.io playerID as a string. */
  index: number;
  userId: string;
  /** From the public profile; null when it is gone. */
  displayName: string | null;
}

export interface RoomRecord {
  id: string;
  hostId: string | null;
  inviteCode: string;
  seatCount: number;
  mapSize: MapSizeId;
  mapSeed: number;
  turnTimerSeconds: number;
  status: RoomStatus;
  /** Sorted by index. */
  seats: SeatRecord[];
  /** The room's match once started. */
  matchId: string | null;
}

export type JoinOutcome = "seated" | "not_found" | "full" | "started";
export type ClaimOutcome = "claimed" | "not_found" | "not_host" | "not_full" | "starting" | "already_started";
export type StartOutcome = "started" | "not_found" | "not_claimed";

/** A claimed start not finished in this long can be claimed again: the function building it died. */
export const STALE_START_SECONDS = 120;

/** A per-user allowance: at most `limit` uses in each fixed window of `windowSeconds`. */
export interface RateLimit {
  limit: number;
  windowSeconds: number;
}

/** A match's first snapshot: boardgame.io's whole state, secrets included. */
export interface InitialMatch {
  state: unknown;
  stateId: number;
  phase: string | null;
}

/** A started match as the move API loads it (#113). */
export interface MatchRecord {
  id: string;
  roomId: string;
  /** boardgame.io's whole state, secrets included: never sent as it is. */
  state: unknown;
  stateId: number;
  seats: SeatRecord[];
}

/** One accepted action, for the append-only move log. */
export interface MoveEntry {
  seat: number;
  userId: string;
  kind: "move" | "event";
  name: string;
  args: unknown[];
  stateIdBefore: number;
  stateIdAfter: number;
}

export interface MatchUpdate {
  matchId: string;
  /** The `state_id` the action was made against: the write happens only if it is still current. */
  expectedStateId: number;
  state: unknown;
  stateId: number;
  phase: string | null;
  /** The game is over: the room is marked finished. */
  finished: boolean;
  move: MoveEntry;
}

/**
 * One of a player's rooms, for their list of voyages: what the list shows,
 * never the match's state. `currentSeat` is the seat whose turn it is in a
 * match under way (boardgame.io's `currentPlayer`), else null; `turn` its
 * turn number.
 */
export interface VoyageRecord {
  roomId: string;
  status: RoomStatus;
  seatCount: number;
  mapSize: MapSizeId;
  /** Sorted by index. */
  seats: SeatRecord[];
  matchId: string | null;
  currentSeat: number | null;
  /** boardgame.io's turn number (`ctx.turn`) of a match under way, else null. */
  turn: number | null;
  /** When the match last moved, or the room was opened: ISO 8601. */
  updatedAt: string;
}

export interface OnlineStore {
  /** Counts one use of `action` by `userId` in the current fixed window; false once over `limit`. */
  consumeRateLimit(userId: string, action: string, limit: number, windowSeconds: number): Promise<boolean>;
  /**
   * Counts the creation against the host's allowance and creates the room
   * with its host in seat 0, in one transaction: the room's id, or null when
   * the allowance is used up. A creation that fails costs nothing.
   */
  createRoom(room: NewRoom, allowance: RateLimit): Promise<string | null>;
  /** Seats the player at the lowest free seat of the room with this invite code. */
  joinRoom(inviteCode: string, userId: string): Promise<{ outcome: JoinOutcome; roomId: string | null }>;
  getRoom(roomId: string): Promise<RoomRecord | null>;
  /**
   * Claims the room's start for its host (open, or a start gone stale, to
   * `starting`), if every seat is taken: before the match is built, so a
   * second start is refused without building another.
   */
  claimStart(roomId: string, userId: string): Promise<{ outcome: ClaimOutcome }>;
  /** Stores the match of a claimed start and marks the room started. */
  startMatch(roomId: string, userId: string, match: InitialMatch): Promise<{ outcome: StartOutcome; matchId: string | null }>;
  /** Gives a claimed start back (building the match failed), so the host can try again. */
  releaseStart(roomId: string): Promise<void>;
  /**
   * The rooms `userId` holds a seat in, most recently changed first, at most
   * `limit`. Nobody else's rooms, and no match state beyond whose turn it is.
   */
  listVoyages(userId: string, limit: number): Promise<VoyageRecord[]>;
  getMatch(matchId: string): Promise<MatchRecord | null>;
  /** The match without its state: its id, state id and seats. For the cheap `?since=` check. */
  getMatchHead(matchId: string): Promise<Omit<MatchRecord, "state"> | null>;
  /**
   * Writes the new snapshot and appends the move to the log, both or
   * neither, if the match is still at `expectedStateId`; false when another
   * write got there first (the client then refetches).
   */
  commitMove(update: MatchUpdate): Promise<boolean>;
}
