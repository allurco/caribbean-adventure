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
export const ROOM_CREATION_LIMIT = 5;
export const ROOM_CREATION_WINDOW_SECONDS = 60 * 60;

export interface RoomServices {
  store: OnlineStore;
  newInviteCode(): string;
  newMapSeed(): number;
}

/** A room as its members see it. */
export function roomView(room: RoomRecord, userId: string) {
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
  if (!body) return fail(400, "expected a JSON object");
  const parsed = parseRoomSettings(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const { store } = services;
  if (!(await store.consumeRateLimit(userId, "create_room", ROOM_CREATION_LIMIT, ROOM_CREATION_WINDOW_SECONDS))) {
    return fail(429, "too many rooms: try again within the hour");
  }
  const { mapSeed = services.newMapSeed(), ...settings } = parsed.settings;
  const roomId = await store.createRoom({ hostId: userId, inviteCode: services.newInviteCode(), mapSeed, ...settings });
  const room = await store.getRoom(roomId);
  return json({ ok: true, room: roomView(room!, userId) }, 201);
}

export async function joinRoom(request: Request, userId: string, { store }: RoomServices): Promise<Response> {
  const body = await readJsonObject(request);
  const inviteCode = body?.inviteCode;
  if (typeof inviteCode !== "string" || inviteCode.length === 0 || inviteCode.length > 64) {
    return fail(400, "expected an inviteCode");
  }
  const { outcome, roomId } = await store.joinRoom(inviteCode, userId);
  if (outcome === "not_found") return fail(404, "no such room");
  if (outcome === "full") return fail(409, "room full");
  if (outcome === "started") return fail(409, "match already started");
  const room = await store.getRoom(roomId!);
  return json({ ok: true, room: roomView(room!, userId) });
}

export async function getRoom(roomId: string, userId: string, { store }: RoomServices): Promise<Response> {
  const room = await memberRoom(store, roomId, userId);
  if (!room) return fail(404, "no such room");
  return json({ ok: true, room: roomView(room, userId) });
}

export async function startRoom(roomId: string, userId: string, { store }: RoomServices): Promise<Response> {
  const room = await memberRoom(store, roomId, userId);
  if (!room) return fail(404, "no such room");
  // Cheap checks first: building a match generates its map. The store checks
  // them again, atomically, as it writes.
  if (room.status !== "open") return fail(409, "match already started");
  if (room.hostId !== userId) return fail(403, "only the host starts the match");
  if (room.seats.length < room.seatCount) return fail(409, "seats still free");

  const state = createMatchState(room.seatCount, { mapSize: room.mapSize, mapSeed: room.mapSeed });
  const { outcome } = await store.startMatch(roomId, userId, {
    state,
    stateId: state._stateID,
    phase: state.ctx.phase ?? null,
  });
  if (outcome === "not_found") return fail(404, "no such room");
  if (outcome === "not_host") return fail(403, "only the host starts the match");
  if (outcome === "not_full") return fail(409, "seats still free");
  if (outcome === "already_started") return fail(409, "match already started");
  const started = await store.getRoom(roomId);
  return json({ ok: true, room: roomView(started!, userId) }, 201);
}
