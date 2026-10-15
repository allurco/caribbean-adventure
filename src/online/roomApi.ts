/**
 * The rooms routes of `/api` (#112) for the browser, over an injected
 * `fetch` and access token: the real ones in the app, fakes in tests. Every
 * call resolves to a result, never throws, so components show what comes back.
 */
import type { MapSizeId } from "../game/mapConfig";

/** A room as its members see it (`roomView` in server/rooms.ts). */
export interface RoomView {
  id: string;
  inviteCode: string;
  invitePath: string;
  seatCount: number;
  mapSize: MapSizeId;
  mapSeed: number;
  turnTimerSeconds: number;
  status: "open" | "started" | "finished";
  isHost: boolean;
  yourSeat: number | null;
  seats: { index: number; userId: string; displayName: string | null }[];
  matchId: string | null;
}

export interface NewRoomSettings {
  seats: number;
  mapSize: MapSizeId;
  turnTimerSeconds: number;
}

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };
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

const MESSAGES: Record<string, string> = {
  "room full": "Every seat in that room is taken.",
  "match already started": "That match has already set sail.",
  "seats still free": "Wait until every seat is taken.",
  "no such room": "No room behind that link. Ask its host for a fresh one.",
  "too many rooms: try again within the hour": "Too many rooms in an hour. Try again later.",
  "only the host starts the match": "Only the host can start the match.",
  "sign in first": "Sign in first.",
};

/** Calls one `/api` route as the signed-in player; shared by the rooms and match clients. */
export async function callApi<T>(deps: ApiDeps, method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  const token = await deps.accessToken();
  if (!token) return { ok: false, status: 401, error: MESSAGES["sign in first"] };
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await deps.fetch(url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch {
    return { ok: false, status: 0, error: "Could not reach the harbour. Check your connection." };
  }
  const payload = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null;
  if (res.ok && payload?.ok) return { ...payload, ok: true };
  const error = (payload?.error && MESSAGES[payload.error]) || `Something went wrong (${res.status}). Try again.`;
  return { ok: false, status: res.status, error };
}

export function createRoomApi(deps: ApiDeps) {
  return {
    createRoom: (settings: NewRoomSettings) => callApi<{ room: RoomView }>(deps, "POST", "/api/rooms", settings),
    joinRoom: (inviteCode: string) => callApi<{ room: RoomView }>(deps, "POST", "/api/rooms/join", { inviteCode }),
    getRoom: (id: string) => callApi<{ room: RoomView }>(deps, "GET", `/api/rooms/${encodeURIComponent(id)}`),
    startRoom: (id: string) => callApi<{ room: RoomView }>(deps, "POST", `/api/rooms/${encodeURIComponent(id)}/start`),
  };
}

export type RoomApi = ReturnType<typeof createRoomApi>;
