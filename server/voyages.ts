/**
 * `GET /api/me/rooms`: the signed-in player's voyages, the rooms they hold a
 * seat in (waiting in the lobby, under way, finished), so they can leave a
 * match and come back to it. Only their own rooms, and of each match no more
 * than whose turn it is and whether it is drafting: never its state, an invite code, a seed or another
 * captain's account id.
 */
import { fail, json } from "./http";
import { combatActor } from "../src/game/combatActor";
import type { OnlineStore, VoyageRecord } from "./onlineStore";

/** The most recent voyages listed; older ones are left out. */
export const VOYAGES_LIMIT = 50;

/** 30 a minute per player: the list is read when the harbour page opens, not polled fast. */
export const VOYAGES_READ_LIMIT = { action: "read_voyages", limit: 30, windowSeconds: 60 } as const;

/**
 * A voyage as its seated player sees it in the list. The store says nothing
 * of a match not under way; here the seat whose step it is comes from the
 * fight when one is on (the attacker stays boardgame.io's current player, but
 * `combatActor` is who may act, as the move check enforces).
 */
export function voyageView(voyage: VoyageRecord, userId: string) {
  const yourSeat = voyage.seats.find((s) => s.userId === userId)!.index;
  const currentSeat = voyage.fight ? seatOf(combatActor(voyage.fight)) : voyage.currentSeat;
  return {
    roomId: voyage.roomId,
    matchId: voyage.matchId,
    status: voyage.status,
    seatCount: voyage.seatCount,
    mapSize: voyage.mapSize,
    seats: voyage.seats.map(({ index, displayName }) => ({ index, displayName })),
    yourSeat,
    currentSeat,
    drafting: voyage.phase === "draft",
    yourTurn: currentSeat !== null && currentSeat === yourSeat,
    updatedAt: voyage.updatedAt,
  };
}

/** A seat's index from its player id; null for anything else (an NPC's id). */
function seatOf(playerId: string): number | null {
  return /^[0-9]$/.test(playerId) ? Number(playerId) : null;
}

export async function listVoyages(userId: string, store: OnlineStore): Promise<Response> {
  const { action, limit, windowSeconds } = VOYAGES_READ_LIMIT;
  if (!(await store.consumeRateLimit(userId, action, limit, windowSeconds))) {
    return fail(429, "rate_limited", "too many reads: slow down");
  }
  const voyages = await store.listVoyages(userId, VOYAGES_LIMIT);
  // The store answers only for the caller; a seat check here too, so a store bug cannot list a stranger's room.
  const own = voyages.filter((v) => v.seats.some((s) => s.userId === userId));
  return json({ ok: true, voyages: own.map((v) => voyageView(v, userId)) });
}
