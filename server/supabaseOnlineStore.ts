/**
 * The `OnlineStore` on Supabase (#112), with the service role: the SQL
 * functions of `supabase/migrations/*_rooms.sql` for every write (each one
 * transaction), plain selects for reads. Covered by the database tests in
 * `supabase/tests/`, not by unit tests.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapSizeId } from "../src/game/mapConfig";
import type { AuthVerifier } from "./handleApiRequest";
import type { ClaimOutcome, JoinOutcome, OnlineStore, RoomRecord, RoomStatus, StartOutcome } from "./onlineStore";

export type ServiceClient = SupabaseClient;

interface RoomRow {
  id: string;
  host_id: string | null;
  invite_code: string;
  seat_count: number;
  map_size: MapSizeId;
  map_seed: number;
  turn_timer_seconds: number;
  status: RoomStatus;
  seats: { seat_index: number; user_id: string }[];
  matches: { id: string }[] | { id: string } | null;
}

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

export function createSupabaseOnlineStore(client: () => Promise<ServiceClient>): OnlineStore {
  return {
    async consumeRateLimit(userId, action, limit, windowSeconds) {
      const db = await client();
      return check(
        await db.rpc("consume_rate_limit", { p_user: userId, p_action: action, p_limit: limit, p_window_seconds: windowSeconds }),
      ) as boolean;
    },

    async createRoom(room, { limit, windowSeconds }) {
      const db = await client();
      return check(
        await db.rpc("create_room", {
          p_host: room.hostId,
          p_invite_code: room.inviteCode,
          p_seat_count: room.seatCount,
          p_map_size: room.mapSize,
          p_map_seed: room.mapSeed,
          p_turn_timer_seconds: room.turnTimerSeconds,
          p_limit: limit,
          p_window_seconds: windowSeconds,
        }),
      ) as string | null;
    },

    async joinRoom(inviteCode, userId) {
      const db = await client();
      const rows = check(await db.rpc("join_room", { p_invite_code: inviteCode, p_user: userId })) as {
        outcome: JoinOutcome;
        room_id: string | null;
      }[];
      return { outcome: rows[0].outcome, roomId: rows[0].room_id };
    },

    async getRoom(roomId) {
      const db = await client();
      const row = check(
        await db
          .from("rooms")
          .select("id, host_id, invite_code, seat_count, map_size, map_seed, turn_timer_seconds, status, seats(seat_index, user_id), matches(id)")
          .eq("id", roomId)
          .maybeSingle(),
      ) as RoomRow | null;
      if (!row) return null;
      const userIds = row.seats.map((s) => s.user_id);
      const profiles = userIds.length
        ? (check(await db.from("profiles").select("id, display_name").in("id", userIds)) as { id: string; display_name: string }[])
        : [];
      const names = new Map(profiles.map((p) => [p.id, p.display_name]));
      const match = Array.isArray(row.matches) ? row.matches[0] : row.matches;
      const record: RoomRecord = {
        id: row.id,
        hostId: row.host_id,
        inviteCode: row.invite_code,
        seatCount: row.seat_count,
        mapSize: row.map_size,
        mapSeed: row.map_seed,
        turnTimerSeconds: row.turn_timer_seconds,
        status: row.status,
        seats: [...row.seats]
          .sort((a, b) => a.seat_index - b.seat_index)
          .map((s) => ({ index: s.seat_index, userId: s.user_id, displayName: names.get(s.user_id) ?? null })),
        matchId: match?.id ?? null,
      };
      return record;
    },

    async claimStart(roomId, userId) {
      const db = await client();
      return { outcome: check(await db.rpc("claim_start", { p_room: roomId, p_user: userId })) as ClaimOutcome };
    },

    async releaseStart(roomId) {
      const db = await client();
      check(await db.rpc("release_start", { p_room: roomId }));
    },

    async startMatch(roomId, userId, match) {
      const db = await client();
      const rows = check(
        await db.rpc("start_match", {
          p_room: roomId,
          p_user: userId,
          p_state: match.state,
          p_state_id: match.stateId,
          p_phase: match.phase,
        }),
      ) as { outcome: StartOutcome; match_id: string | null }[];
      return { outcome: rows[0].outcome, matchId: rows[0].match_id };
    },

    async getMatch(matchId) {
      const db = await client();
      const row = check(
        await db.from("matches").select("id, room_id, state, state_id").eq("id", matchId).maybeSingle(),
      ) as { id: string; room_id: string; state: unknown; state_id: number } | null;
      if (!row) return null;
      const seats = check(
        await db.from("seats").select("seat_index, user_id").eq("room_id", row.room_id).order("seat_index"),
      ) as { seat_index: number; user_id: string }[];
      return {
        id: row.id,
        roomId: row.room_id,
        state: row.state,
        stateId: row.state_id,
        seats: seats.map((s) => ({ index: s.seat_index, userId: s.user_id, displayName: null })),
      };
    },

    async commitMove(update) {
      const db = await client();
      return check(
        await db.rpc("commit_move", {
          p_match: update.matchId,
          p_expected_state_id: update.expectedStateId,
          p_state: update.state,
          p_state_id: update.stateId,
          p_phase: update.phase,
          p_finished: update.finished,
          p_seat: update.move.seat,
          p_user: update.move.userId,
          p_kind: update.move.kind,
          p_name: update.move.name,
          p_args: update.move.args,
        }),
      ) as boolean;
    },
  };
}

/**
 * Checks an access token with Supabase Auth (`auth.getUser`), which rejects
 * forged, expired and signed-out tokens. Null for any of those.
 */
export function supabaseAuthVerifier(client: () => Promise<ServiceClient>): AuthVerifier {
  return async (accessToken) => {
    const db = await client();
    const { data, error } = await db.auth.getUser(accessToken);
    return error || !data.user ? null : data.user.id;
  };
}
