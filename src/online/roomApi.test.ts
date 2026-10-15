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
  hostSeat: 0,
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
    // By the server's stable codes, whatever its sentences say.
    const cases: [number, string, string][] = [
      [409, "room_full", "Every seat in that room is taken."],
      [409, "match_started", "That match has already set sail."],
      [409, "match_starting", "The match is being started. Give it a moment."],
      [409, "seats_free", "Wait until every seat is taken."],
      [404, "not_found", "No room behind that link. Ask its host for a fresh one."],
      [429, "rate_limited", "Too many rooms in an hour. Try again later."],
      [403, "not_host", "Only the host can start the match."],
      [401, "unauthorized", "Sign in first."],
      [500, "internal", "Something went wrong (500). Try again."],
      [418, "a_code_from_the_future", "Something went wrong (418). Try again."],
    ];
    for (const [status, code, message] of cases) {
      const { fetch } = fakeFetch(status, { ok: false, code, error: "any sentence" });
      const result = await createRoomApi({ fetch, accessToken: async () => "tok" }).joinRoom("x");
      expect(result, code).toEqual({ ok: false, status, code, error: message });
    }
  });

  it("asks a signed-out player to sign in, without calling the server", async () => {
    const { fetch, calls } = fakeFetch(200, { ok: true, room: ROOM });
    const result = await createRoomApi({ fetch, accessToken: async () => null }).getRoom(ROOM.id);
    expect(result).toEqual({ ok: false, status: 401, code: "unauthorized", error: "Sign in first." });
    expect(calls).toEqual([]);
  });

  it("reports a network failure instead of throwing", async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    const result = await createRoomApi({ fetch, accessToken: async () => "tok" }).getRoom(ROOM.id);
    expect(result).toEqual({ ok: false, status: 0, code: "network", error: "Could not reach the harbour. Check your connection." });
  });

  it("lists the player's voyages from their own route", async () => {
    const voyages = [{ roomId: ROOM.id, status: "open" }];
    const { fetch, calls } = fakeFetch(200, { ok: true, voyages });
    const result = await createRoomApi({ fetch, accessToken: async () => "tok" }).listVoyages();
    expect(result).toEqual({ ok: true, voyages });
    expect(calls.map((c) => [c.method, c.url, c.headers.authorization])).toEqual([["GET", "/api/me/rooms", "Bearer tok"]]);
  });

  it("says when the voyages are asked for too often", async () => {
    const { fetch } = fakeFetch(429, { ok: false, code: "rate_limited", error: "any" });
    const result = await createRoomApi({ fetch, accessToken: async () => "tok" }).listVoyages();
    expect(result).toMatchObject({ ok: false, code: "rate_limited", error: "The harbour master is busy. Try again in a minute." });
  });
});
