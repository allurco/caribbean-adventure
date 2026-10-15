/**
 * A new room's settings from the request body (#112), checked against the
 * game's limits before anything is written. Pure.
 */
import type { MapSizeId } from "../src/game/mapConfig";
import { isValidMapSeed } from "../src/game/mapSeed";
import { MAX_SEATS } from "../src/game/seats";

/** An online match has at least two captains; solo is the local game. */
export const MIN_ROOM_SEATS = 2;
export const MAX_ROOM_SEATS = MAX_SEATS;

/** PRD #104: a day a turn for asynchronous play by default, two minutes for live play. */
export const DEFAULT_TURN_TIMER_SECONDS = 24 * 60 * 60;
export const MIN_TURN_TIMER_SECONDS = 60;
export const MAX_TURN_TIMER_SECONDS = 7 * 24 * 60 * 60;

const MAP_SIZES: readonly MapSizeId[] = ["small", "medium", "large"];

export interface RoomSettings {
  seatCount: number;
  mapSize: MapSizeId;
  /** Absent: the server picks one. */
  mapSeed?: number;
  turnTimerSeconds: number;
}

export type SettingsResult = { ok: true; settings: RoomSettings } | { ok: false; error: string };

export function parseRoomSettings(body: Record<string, unknown>): SettingsResult {
  const { seats, mapSize = "small", mapSeed, turnTimerSeconds = DEFAULT_TURN_TIMER_SECONDS } = body;
  if (typeof seats !== "number" || !Number.isInteger(seats) || seats < MIN_ROOM_SEATS || seats > MAX_ROOM_SEATS) {
    return { ok: false, error: `seats must be a whole number from ${MIN_ROOM_SEATS} to ${MAX_ROOM_SEATS}` };
  }
  if (typeof mapSize !== "string" || !(MAP_SIZES as readonly string[]).includes(mapSize)) {
    return { ok: false, error: "mapSize must be small, medium or large" };
  }
  if (mapSeed !== undefined && !isValidMapSeed(mapSeed)) {
    return { ok: false, error: "mapSeed must be a whole number within int32" };
  }
  if (
    typeof turnTimerSeconds !== "number" ||
    !Number.isInteger(turnTimerSeconds) ||
    turnTimerSeconds < MIN_TURN_TIMER_SECONDS ||
    turnTimerSeconds > MAX_TURN_TIMER_SECONDS
  ) {
    return { ok: false, error: `turnTimerSeconds must be from ${MIN_TURN_TIMER_SECONDS} to ${MAX_TURN_TIMER_SECONDS}` };
  }
  return {
    ok: true,
    settings: {
      seatCount: seats,
      mapSize: mapSize as MapSizeId,
      ...(mapSeed !== undefined ? { mapSeed: mapSeed as number } : {}),
      turnTimerSeconds,
    },
  };
}
