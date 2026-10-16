/**
 * The rooms routes of `/api` (#112) for the browser, over an injected
 * `fetch` and access token: the real ones in the app, fakes in tests. Every
 * call resolves to a result, never throws, so components show what comes back.
 */
import type { MapSizeId } from "../game/mapConfig";

/** `starting`: the host's start is claimed and the match is being built (`RoomStatus` in server/onlineStore.ts). */
export type RoomStatus = "open" | "starting" | "started" | "finished";

/** A room as its members see it (`roomView` in server/rooms.ts). */
export interface RoomView {
  id: string;
  inviteCode: string;
  invitePath: string;
  seatCount: number;
  mapSize: MapSizeId;
  mapSeed: number;
  turnTimerSeconds: number;
  status: RoomStatus;
  isHost: boolean;
  /** The host's seat (from the room's host, not seat 0); null once the host's account is gone. */
  hostSeat: number | null;
  yourSeat: number | null;
  seats: { index: number; userId: string; displayName: string | null }[];
  matchId: string | null;
}

/** One of the player's rooms, as `GET /api/me/rooms` sends it (`voyageView` in server/voyages.ts). */
export interface VoyageView {
  roomId: string;
  matchId: string | null;
  status: RoomStatus;
  seatCount: number;
  mapSize: MapSizeId;
  seats: { index: number; displayName: string | null }[];
  yourSeat: number;
  /** The seat that may act in a match under way (in a fight, the one whose step it is); null otherwise. */
  currentSeat: number | null;
  /** The match is in its captain draft. */
  drafting: boolean;
  yourTurn: boolean;
  updatedAt: string;
}

export interface NewRoomSettings {
  seats: number;
  mapSize: MapSizeId;
  /** Absent: the server picks one. */
  mapSeed?: number;
  turnTimerSeconds: number;
}

/** A refusal: `code` is the server's stable code (`ApiErrorCode` in server/http.ts), or `network`; `error` a sentence to show. */
export type ApiResult<T> = ({ ok: true } & T) | { ok: false; status: number; code: string; error: string };
export type RoomResult = ApiResult<{ room: RoomView }>;

export interface RequestInitLike {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export type FetchLike = (url: string, init: RequestInitLike) => Promise<Response>;

export interface ApiDeps {
  fetch: FetchLike;
  /** The signed-in player's current access token, or null when signed out. */
  accessToken: () => Promise<string | null>;
}

/** What to show for each of the server's codes; a code not listed reads as a generic failure. */
export type Messages = Readonly<Record<string, string>>;

const COMMON: Messages = {
  unauthorized: "Sign in first.",
  account_deleted: "This account was deleted. Sign out to start afresh.",
  network: "Could not reach the harbour. Check your connection.",
};

const ROOM_MESSAGES: Messages = {
  room_full: "Every seat in that room is taken.",
  match_started: "That match has already set sail.",
  match_starting: "The match is being started. Give it a moment.",
  seats_free: "Wait until every seat is taken.",
  not_found: "No room behind that link. Ask its host for a fresh one.",
  rate_limited: "Too many rooms in an hour. Try again later.",
  not_host: "Only the host can start the match.",
};

/** Calls one `/api` route as the signed-in player; shared by the rooms and match clients. */
export async function callApi<T>(deps: ApiDeps, messages: Messages, method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  const refuse = (status: number, code: string) => ({
    ok: false as const,
    status,
    code,
    error: messages[code] ?? COMMON[code] ?? `Something went wrong (${status}). Try again.`,
  });
  const token = await deps.accessToken();
  if (!token) return refuse(401, "unauthorized");
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await deps.fetch(url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch {
    return refuse(0, "network");
  }
  const payload = (await res.json().catch(() => null)) as ({ ok?: boolean; code?: string } & T) | null;
  if (res.ok && payload?.ok) return { ...payload, ok: true };
  return refuse(res.status, typeof payload?.code === "string" ? payload.code : "internal");
}

const VOYAGE_MESSAGES: Messages = {
  rate_limited: "The harbour master is busy. Try again in a minute.",
};

export function createRoomApi(deps: ApiDeps) {
  return {
    createRoom: (settings: NewRoomSettings) => callApi<{ room: RoomView }>(deps, ROOM_MESSAGES, "POST", "/api/rooms", settings),
    joinRoom: (inviteCode: string) => callApi<{ room: RoomView }>(deps, ROOM_MESSAGES, "POST", "/api/rooms/join", { inviteCode }),
    getRoom: (id: string) => callApi<{ room: RoomView }>(deps, ROOM_MESSAGES, "GET", `/api/rooms/${encodeURIComponent(id)}`),
    /** The player's rooms and matches, most recent first (`GET /api/me/rooms`). */
    listVoyages: () => callApi<{ voyages: VoyageView[] }>(deps, VOYAGE_MESSAGES, "GET", "/api/me/rooms"),
    startRoom: (id: string) => callApi<{ room: RoomView }>(deps, ROOM_MESSAGES, "POST", `/api/rooms/${encodeURIComponent(id)}/start`),
  };
}

export type RoomApi = ReturnType<typeof createRoomApi>;
