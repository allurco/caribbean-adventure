/**
 * What `/api` needs from the database (#112), as a narrow port: the Supabase
 * implementation (`supabaseOnlineStore.ts`, service role, the SQL functions of
 * `supabase/migrations/*_rooms.sql`) in production, and an in-memory one
 * (`memoryOnlineStore.ts`) in the route tests. Every operation that must not
 * race (taking a seat, starting a match) is one call, atomic in the database.
 */
import type { MapSizeId } from "../src/game/mapConfig";
import type { CombatState } from "../src/game/types";

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

/**
 * Thrown by a store operation acting for a player whose account is deleted
 * (#108): the profile is the "deleted player" placeholder, or the sign-in is
 * gone. A token can outlive either for a moment; `/api` answers 401, as for
 * a token that no longer signs in.
 */
export function accountGone(): Error {
  return Object.assign(new Error("the account is deleted"), { code: ACCOUNT_GONE });
}

export function isAccountGone(error: unknown): boolean {
  return error instanceof Error && (error as Error & { code?: unknown }).code === ACCOUNT_GONE;
}

const ACCOUNT_GONE = "account_gone";

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

/** When a seat was last seen (#114, `seatSeen.ts`): kept on the server, never sent. */
export interface SeatSeen {
  index: number;
  /** ISO 8601, or null before the seat's first read or move. */
  lastSeenAt: string | null;
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
 * The fight on in a match, as public as `G.combat` already is to every seat
 * (`playerView.ts`): only what says whose step it is (`combatActor`).
 */
export type VoyageFight = Pick<CombatState, "stage" | "attackerId" | "seamanshipWinner" | "isNPCCombat">;

/**
 * One of a player's rooms, for their list of voyages: what the list shows,
 * never the match's state. The store owns the rule that `currentSeat`,
 * `phase` and `fight` are said only of a match under way (status `started`):
 * null otherwise.
 */
export interface VoyageRecord {
  roomId: string;
  status: RoomStatus;
  seatCount: number;
  mapSize: MapSizeId;
  /** Sorted by index. */
  seats: SeatRecord[];
  matchId: string | null;
  /** boardgame.io's `currentPlayer`: in a fight, still the attacker. */
  currentSeat: number | null;
  /** boardgame.io's phase (`draft`, `main`, `combat`). */
  phase: string | null;
  /** The fight on (`G.combat`), if any. */
  fight: VoyageFight | null;
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
   *
   * `createRoom`, `joinRoom` and `commitMove` throw `accountGone()` for a
   * player whose profile is deleted, checked under a lock on the profile so a
   * deletion cannot interleave; every operation that counts against an
   * allowance throws it once the sign-in is gone.
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
  /**
   * When each seat of the room was last seen (#114). Its own query, apart
   * from `getMatch` and `getMatchHead`, so a database without the column (the
   * migration not yet pushed) costs only the online dot, never the match.
   */
  seatsLastSeen(roomId: string): Promise<SeatSeen[]>;
  /**
   * Records that seat `seatIndex` of room `roomId` was seen at `at` (ISO
   * 8601), its read or move of the match (#114), unless it was seen at or
   * after `staleBefore`: the throttle is in the write, so requests in
   * parallel do not each write.
   */
  markSeatSeen(roomId: string, seatIndex: number, at: string, staleBefore: string): Promise<void>;
  /**
   * The first half of deleting an account (#108), in one transaction:
   * anonymises the profile (the "deleted player" placeholder, nothing
   * personal kept) and leaves every room still open (the seat is freed, a room
   * they hosted passes to the lowest seat left, a room left empty is closed).
   * Seats in started and finished matches stay. Idempotent.
   */
  anonymiseAccount(userId: string): Promise<void>;
  /**
   * The second half: removes the sign-in identity (Supabase Auth's user and
   * its identities), so the same email or provider signs up afresh. Done
   * already counts as done.
   */
  deleteSignIn(userId: string): Promise<void>;
}
