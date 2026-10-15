/**
 * An in-memory `OnlineStore` for the route tests (#112): the same outcomes as
 * the SQL functions in `supabase/migrations/*_rooms.sql`, which the database
 * tests in `supabase/tests/` hold to the real thing. Not used in production.
 */
import {
  STALE_START_SECONDS,
  type ClaimOutcome,
  type InitialMatch,
  type JoinOutcome,
  type MoveEntry,
  type NewRoom,
  type OnlineStore,
  type RoomRecord,
  type StartOutcome,
} from "./onlineStore";

interface StoredMatch extends InitialMatch {
  id: string;
  roomId: string;
}

type StoredRoom = Omit<RoomRecord, "seats" | "matchId"> & { startClaimedAt: number | null };

export interface MemoryOnlineStore extends OnlineStore {
  /** The stored match, whole state included: for tests only. */
  peekMatch(matchId: string): Promise<StoredMatch | null>;
  /** The match's move log, oldest first: for tests only. */
  peekMoves(matchId: string): Promise<(MoveEntry & { at: string })[]>;
}

export function createMemoryOnlineStore({
  displayName = () => null,
  now = () => Date.now(),
}: { displayName?: (userId: string) => string | null; now?: () => number } = {}): MemoryOnlineStore {
  const rooms = new Map<string, StoredRoom>();
  const seats = new Map<string, Map<number, string>>();
  const matches = new Map<string, StoredMatch>();
  const counters = new Map<string, number>();
  const moves = new Map<string, (MoveEntry & { at: string })[]>();
  let ids = 0;
  const newId = () => `00000000-0000-4000-9000-${String(++ids).padStart(12, "0")}`;

  function record(roomId: string): RoomRecord | null {
    const room = rooms.get(roomId);
    if (!room) return null;
    const { startClaimedAt: _claimed, ...rest } = room;
    void _claimed;
    const taken = [...(seats.get(roomId) ?? new Map<number, string>()).entries()].sort(([a], [b]) => a - b);
    const match = [...matches.values()].find((m) => m.roomId === roomId);
    return {
      ...rest,
      seats: taken.map(([index, userId]) => ({ index, userId, displayName: displayName(userId) })),
      matchId: match?.id ?? null,
    };
  }

  function consume(userId: string, action: string, limit: number, windowSeconds: number, commit: boolean): boolean {
    const key = `${userId}|${action}|${Math.floor(now() / 1000 / windowSeconds)}`;
    const count = (counters.get(key) ?? 0) + 1;
    if (commit) counters.set(key, count);
    return count <= limit;
  }

  return {
    async consumeRateLimit(userId, action, limit, windowSeconds) {
      return consume(userId, action, limit, windowSeconds, true);
    },

    async createRoom(room: NewRoom, { limit, windowSeconds }) {
      // As in the SQL function: the count and the room commit together.
      if (!consume(room.hostId, "create_room", limit, windowSeconds, true)) return null;
      const id = newId();
      const { hostId, ...settings } = room;
      rooms.set(id, { id, hostId, status: "open", startClaimedAt: null, ...settings });
      seats.set(id, new Map([[0, hostId]]));
      return id;
    },

    async joinRoom(inviteCode, userId): Promise<{ outcome: JoinOutcome; roomId: string | null }> {
      const room = [...rooms.values()].find((r) => r.inviteCode === inviteCode);
      if (!room) return { outcome: "not_found", roomId: null };
      const taken = seats.get(room.id)!;
      if ([...taken.values()].includes(userId)) return { outcome: "seated", roomId: room.id };
      if (room.status !== "open") return { outcome: "started", roomId: room.id };
      for (let i = 0; i < room.seatCount; i++) {
        if (!taken.has(i)) {
          taken.set(i, userId);
          return { outcome: "seated", roomId: room.id };
        }
      }
      return { outcome: "full", roomId: room.id };
    },

    async getRoom(roomId) {
      return record(roomId);
    },

    async claimStart(roomId, userId): Promise<{ outcome: ClaimOutcome }> {
      const room = rooms.get(roomId);
      if (!room) return { outcome: "not_found" };
      const stale = room.status === "starting" && now() - room.startClaimedAt! >= STALE_START_SECONDS * 1000;
      if (room.status === "starting" && !stale) return { outcome: "starting" };
      if (room.status !== "open" && !stale) return { outcome: "already_started" };
      if (room.hostId !== userId) return { outcome: "not_host" };
      if (seats.get(roomId)!.size < room.seatCount) return { outcome: "not_full" };
      room.status = "starting";
      room.startClaimedAt = now();
      return { outcome: "claimed" };
    },

    async startMatch(roomId, userId, match): Promise<{ outcome: StartOutcome; matchId: string | null }> {
      const room = rooms.get(roomId);
      if (!room) return { outcome: "not_found", matchId: null };
      if (room.status !== "starting" || room.hostId !== userId) return { outcome: "not_claimed", matchId: null };
      const id = newId();
      matches.set(id, { id, roomId, ...structuredClone(match) });
      room.status = "started";
      return { outcome: "started", matchId: id };
    },

    async getMatch(matchId) {
      const match = matches.get(matchId);
      if (!match) return null;
      return { id: match.id, roomId: match.roomId, state: structuredClone(match.state), stateId: match.stateId, seats: record(match.roomId)!.seats };
    },

    async getMatchHead(matchId) {
      const match = matches.get(matchId);
      if (!match) return null;
      return { id: match.id, roomId: match.roomId, stateId: match.stateId, seats: record(match.roomId)!.seats };
    },

    async commitMove(update) {
      const match = matches.get(update.matchId);
      if (!match || match.stateId !== update.expectedStateId) return false;
      match.state = structuredClone(update.state);
      match.stateId = update.stateId;
      match.phase = update.phase;
      if (update.finished) rooms.get(match.roomId)!.status = "finished";
      moves.set(match.id, [...(moves.get(match.id) ?? []), { ...structuredClone(update.move), at: new Date(now()).toISOString() }]);
      return true;
    },

    async releaseStart(roomId) {
      const room = rooms.get(roomId);
      if (room?.status === "starting") {
        room.status = "open";
        room.startClaimedAt = null;
      }
    },

    async peekMatch(matchId) {
      return matches.get(matchId) ?? null;
    },

    async peekMoves(matchId) {
      return moves.get(matchId) ?? [];
    },
  };
}
