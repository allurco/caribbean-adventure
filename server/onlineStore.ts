/**
 * What `/api` needs from the database (#112), as a narrow port: the Supabase
 * implementation (`supabaseOnlineStore.ts`, service role, the SQL functions of
 * `supabase/migrations/*_rooms.sql`) in production, and an in-memory one
 * (`memoryOnlineStore.ts`) in the route tests. Every operation that must not
 * race (taking a seat, starting a match) is one call, atomic in the database.
 */
import type { MapSizeId } from "../src/game/mapConfig";

export type RoomStatus = "open" | "started" | "finished";

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
export type StartOutcome = "started" | "not_found" | "not_host" | "not_full" | "already_started";

/** A match's first snapshot: boardgame.io's whole state, secrets included. */
export interface InitialMatch {
  state: unknown;
  stateId: number;
  phase: string | null;
}

export interface OnlineStore {
  /** Counts one use of `action` by `userId` in the current fixed window; false once over `limit`. */
  consumeRateLimit(userId: string, action: string, limit: number, windowSeconds: number): Promise<boolean>;
  /** Creates the room with its host in seat 0; resolves to the room's id. */
  createRoom(room: NewRoom): Promise<string>;
  /** Seats the player at the lowest free seat of the room with this invite code. */
  joinRoom(inviteCode: string, userId: string): Promise<{ outcome: JoinOutcome; roomId: string | null }>;
  getRoom(roomId: string): Promise<RoomRecord | null>;
  /** Stores the match and marks the room started, if `userId` hosts it and every seat is taken. */
  startMatch(roomId: string, userId: string, match: InitialMatch): Promise<{ outcome: StartOutcome; matchId: string | null }>;
}
