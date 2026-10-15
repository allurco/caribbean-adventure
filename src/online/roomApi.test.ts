import { describe, expect, it } from "vitest";
import { createRoomApi, type FetchLike } from "./roomApi";

const ROOM = {
  id: "00000000-0000-4000-9000-000000000001",
  inviteCode: "abcdefghijklmnopqrstuv",
  invitePath: "/?view=join&invite=abcdefghijklmnopqrstuv",
  seatCount: 2,
  mapSize: "small",
  mapSeed: 7,
  turnTimerSeconds: 86400,
  status: "open",
  isHost: true,
  yourSeat: 0,
  seats: [{ index: 0, userId: "u1", displayName: "Anne" }],
  matchId: null,
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(status: number, body: unknown): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

describe("the rooms API client", () => {
  it("creates a room with the player's access token and returns it", async () => {
    const { fetch, calls } = fakeFetch(201, { ok: true, room: ROOM });
    const api = createRoomApi({ fetch, accessToken: async () => "tok" });
    const result = await api.createRoom({ seats: 2, mapSize: "small", turnTimerSeconds: 86400 });
    expect(result).toEqual({ ok: true, room: ROOM });
    expect(calls).toEqual([
      {
        url: "/api/rooms",
        method: "POST",
        headers: { authorization: "Bearer tok", "content-type": "application/json" },
        body: { seats: 2, mapSize: "small", turnTimerSeconds: 86400 },
      },
    ]);
  });

  it("joins by invite code, reads and starts a room at their own paths", async () => {
    const { fetch, calls } = fakeFetch(200, { ok: true, room: ROOM });
    const api = createRoomApi({ fetch, accessToken: async () => "tok" });
    await api.joinRoom("abcdefghijklmnopqrstuv");
    await api.getRoom(ROOM.id);
    await api.startRoom(ROOM.id);
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ["POST", "/api/rooms/join", { inviteCode: "abcdefghijklmnopqrstuv" }],
      ["GET", `/api/rooms/${ROOM.id}`, undefined],
      ["POST", `/api/rooms/${ROOM.id}/start`, undefined],
    ]);
  });

  it("turns the server's refusals into readable errors", async () => {
    const cases: [number, string, string][] = [
      [409, "room full", "Every seat in that room is taken."],
      [409, "match already started", "That match has already set sail."],
      [409, "seats still free", "Wait until every seat is taken."],
      [404, "no such room", "No room behind that link. Ask its host for a fresh one."],
      [429, "too many rooms: try again within the hour", "Too many rooms in an hour. Try again later."],
      [403, "only the host starts the match", "Only the host can start the match."],
      [500, "something went wrong", "Something went wrong (500). Try again."],
    ];
    for (const [status, error, message] of cases) {
      const { fetch } = fakeFetch(status, { ok: false, error });
      const result = await createRoomApi({ fetch, accessToken: async () => "tok" }).joinRoom("x");
      expect(result, error).toEqual({ ok: false, status, error: message });
    }
  });

  it("asks a signed-out player to sign in, without calling the server", async () => {
    const { fetch, calls } = fakeFetch(200, { ok: true, room: ROOM });
    const result = await createRoomApi({ fetch, accessToken: async () => null }).getRoom(ROOM.id);
    expect(result).toEqual({ ok: false, status: 401, error: "Sign in first." });
    expect(calls).toEqual([]);
  });

  it("reports a network failure instead of throwing", async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    const result = await createRoomApi({ fetch, accessToken: async () => "tok" }).getRoom(ROOM.id);
    expect(result).toEqual({ ok: false, status: 0, error: "Could not reach the harbour. Check your connection." });
  });
});
