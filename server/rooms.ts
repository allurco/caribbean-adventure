/**
 * The rooms routes (#112): create a private room, join it by its invite
 * code, read it, and start its match. Every route acts for the signed-in
 * player `userId` (checked by the caller); every write goes through the
 * store, whose operations are atomic in the database.
 */
import { joinPath } from "../src/online/onlineRoute";
import { fail, isUuid, json, readJsonObject } from "./http";
import { createMatchState } from "./matchEngine";
import type { OnlineStore, RoomRecord } from "./onlineStore";
import { parseRoomSettings } from "./roomSettings";

/** PRD #104: five rooms an hour per player, counted in Postgres. */
export const ROOM_CREATION_LIMIT = { limit: 5, windowSeconds: 60 * 60 };

export interface RoomServices {
  store: OnlineStore;
  newInviteCode(): string;
  newMapSeed(): number;
  newMatchSeed(): string;
}

/**
 * A room as its members see it. `hostSeat` is the seat of the room's host
 * (`host_id`); null once the host's account is gone, when nobody can start
 * the room any more.
 */
export function roomView(room: RoomRecord, userId: string) {
  const host = room.seats.find((s) => s.userId === room.hostId);
  return {
    id: room.id,
    inviteCode: room.inviteCode,
    invitePath: joinPath(room.inviteCode),
    seatCount: room.seatCount,
    mapSize: room.mapSize,
    mapSeed: room.mapSeed,
    turnTimerSeconds: room.turnTimerSeconds,
    status: room.status,
    isHost: room.hostId === userId,
    hostSeat: host?.index ?? null,
    yourSeat: room.seats.find((s) => s.userId === userId)?.index ?? null,
    seats: room.seats.map(({ index, userId: seatUser, displayName }) => ({ index, userId: seatUser, displayName })),
    matchId: room.matchId,
  };
}

/** The room, if `userId` holds a seat in it; null otherwise, so a stranger cannot tell it exists. */
async function memberRoom(store: OnlineStore, roomId: string, userId: string): Promise<RoomRecord | null> {
  if (!isUuid(roomId)) return null;
  const room = await store.getRoom(roomId);
  return room && room.seats.some((s) => s.userId === userId) ? room : null;
}

export async function createRoom(request: Request, userId: string, services: RoomServices): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return fail(400, "bad_request", "expected a JSON object");
  const parsed = parseRoomSettings(body);
  if (!parsed.ok) return fail(400, "bad_request", parsed.error);
  const { store } = services;
  const { mapSeed = services.newMapSeed(), ...settings } = parsed.settings;
  // The allowance is counted in the same transaction as the room: a failed creation costs nothing.
  const roomId = await store.createRoom({ hostId: userId, inviteCode: services.newInviteCode(), mapSeed, ...settings }, ROOM_CREATION_LIMIT);
  if (!roomId) return fail(429, "rate_limited", "too many rooms: try again within the hour");
  const room = await store.getRoom(roomId);
  return json({ ok: true, room: roomView(room!, userId) }, 201);
}

export async function joinRoom(request: Request, userId: string, { store }: RoomServices): Promise<Response> {
  const body = await readJsonObject(request);
  const inviteCode = body?.inviteCode;
  if (typeof inviteCode !== "string" || inviteCode.length === 0 || inviteCode.length > 64) {
    return fail(400, "bad_request", "expected an inviteCode");
  }
  const { outcome, roomId } = await store.joinRoom(inviteCode, userId);
  if (outcome === "not_found") return fail(404, "not_found", "no such room");
  if (outcome === "full") return fail(409, "room_full", "room full");
  if (outcome === "started") return fail(409, "match_started", "match already started");
  const room = await store.getRoom(roomId!);
  return json({ ok: true, room: roomView(room!, userId) });
}

export async function getRoom(roomId: string, userId: string, { store }: RoomServices): Promise<Response> {
  const room = await memberRoom(store, roomId, userId);
  if (!room) return fail(404, "not_found", "no such room");
  return json({ ok: true, room: roomView(room, userId) });
}

export async function startRoom(roomId: string, userId: string, services: RoomServices): Promise<Response> {
  const { store } = services;
  const room = await memberRoom(store, roomId, userId);
  if (!room) return fail(404, "not_found", "no such room");
  // Claim the start first, atomically: building a match generates its map,
  // so a second start must be refused before it builds another.
  const { outcome: claim } = await store.claimStart(roomId, userId);
  if (claim === "not_found") return fail(404, "not_found", "no such room");
  if (claim === "not_host") return fail(403, "not_host", "only the host starts the match");
  if (claim === "not_full") return fail(409, "seats_free", "seats still free");
  if (claim === "starting") return fail(409, "match_starting", "the match is being started");
  if (claim === "already_started") return fail(409, "match_started", "match already started");

  let outcome;
  try {
    const state = createMatchState(room.seatCount, { mapSize: room.mapSize, mapSeed: room.mapSeed }, services.newMatchSeed());
    ({ outcome } = await store.startMatch(roomId, userId, { state, stateId: state._stateID, phase: state.ctx.phase ?? null }));
  } catch (error) {
    await store.releaseStart(roomId);
    throw error;
  }
  if (outcome !== "started") return fail(409, "match_started", "match already started");
  const started = await store.getRoom(roomId);
  return json({ ok: true, room: roomView(started!, userId) }, 201);
}
