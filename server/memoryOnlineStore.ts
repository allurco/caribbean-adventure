/**
 * An in-memory `OnlineStore` for the route tests (#112): the same outcomes as
 * the SQL functions in `supabase/migrations/*_rooms.sql`, which the database
 * tests in `supabase/tests/` hold to the real thing. Not used in production.
 */
import type { InitialMatch, JoinOutcome, MoveEntry, NewRoom, OnlineStore, RoomRecord, StartOutcome } from "./onlineStore";

interface StoredMatch extends InitialMatch {
  id: string;
  roomId: string;
}

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
  const rooms = new Map<string, Omit<RoomRecord, "seats" | "matchId">>();
  const seats = new Map<string, Map<number, string>>();
  const matches = new Map<string, StoredMatch>();
  const counters = new Map<string, number>();
  const moves = new Map<string, (MoveEntry & { at: string })[]>();
  let ids = 0;
  const newId = () => `00000000-0000-4000-9000-${String(++ids).padStart(12, "0")}`;

  function record(roomId: string): RoomRecord | null {
    const room = rooms.get(roomId);
    if (!room) return null;
    const taken = [...(seats.get(roomId) ?? new Map<number, string>()).entries()].sort(([a], [b]) => a - b);
    const match = [...matches.values()].find((m) => m.roomId === roomId);
    return {
      ...room,
      seats: taken.map(([index, userId]) => ({ index, userId, displayName: displayName(userId) })),
      matchId: match?.id ?? null,
    };
  }

  return {
    async consumeRateLimit(userId, action, limit, windowSeconds) {
      const window = Math.floor(now() / 1000 / windowSeconds);
      const key = `${userId}|${action}|${window}`;
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return count <= limit;
    },

    async createRoom(room: NewRoom) {
      const id = newId();
      const { hostId, ...settings } = room;
      rooms.set(id, { id, hostId, status: "open", ...settings });
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

    async startMatch(roomId, userId, match): Promise<{ outcome: StartOutcome; matchId: string | null }> {
      const room = rooms.get(roomId);
      if (!room) return { outcome: "not_found", matchId: null };
      if (room.status !== "open") return { outcome: "already_started", matchId: record(roomId)!.matchId };
      if (room.hostId !== userId) return { outcome: "not_host", matchId: null };
      if (seats.get(roomId)!.size < room.seatCount) return { outcome: "not_full", matchId: null };
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

    async peekMatch(matchId) {
      return matches.get(matchId) ?? null;
    },

    async peekMoves(matchId) {
      return moves.get(matchId) ?? [];
    },
  };
}
