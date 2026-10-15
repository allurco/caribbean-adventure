import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest, type ApiServices } from "./handleApiRequest";
import { createMemoryOnlineStore } from "./memoryOnlineStore";
import type { OnlineStore } from "./onlineStore";
import { newMatchSeed } from "./services";

// The rooms API (#112) through its one public seam, handleApiRequest, with
// the database replaced by the in-memory store and sign-in by a token table.
const ANNE = "00000000-0000-4000-8000-00000000000a";
const JACK = "00000000-0000-4000-8000-00000000000b";
const MARY = "00000000-0000-4000-8000-00000000000c";
const TOKENS: Record<string, string> = { "anne-token": ANNE, "jack-token": JACK, "mary-token": MARY };
const NAMES: Record<string, string> = { [ANNE]: "Anne Bonny", [JACK]: "Calico Jack", [MARY]: "Mary Read" };

let store: OnlineStore;
let services: ApiServices;
let codes: number;
let seeds: number;

beforeEach(() => {
  store = createMemoryOnlineStore({ displayName: (id) => NAMES[id] ?? null });
  codes = 0;
  seeds = 0;
  services = {
    auth: async (token) => TOKENS[token] ?? null,
    store,
    newInviteCode: () => `invite-code-${String(++codes).padStart(10, "0")}`,
    newMapSeed: () => 4242,
    newMatchSeed: () => `match-seed-${++seeds}`,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function call(method: string, path: string, token?: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return handleApiRequest(
    new Request(`https://game.example${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    {},
    services,
  );
}

interface RoomBody {
  id: string;
  inviteCode: string;
  invitePath: string;
  seatCount: number;
  mapSize: string;
  mapSeed: number;
  turnTimerSeconds: number;
  status: string;
  isHost: boolean;
  hostSeat: number | null;
  yourSeat: number;
  seats: { index: number; userId: string; displayName: string | null }[];
  matchId: string | null;
}

async function createRoom(token = "anne-token", settings: Record<string, unknown> = { seats: 2 }): Promise<RoomBody> {
  const res = await call("POST", "/api/rooms", token, settings);
  expect(res.status).toBe(201);
  return ((await res.json()) as { room: RoomBody }).room;
}

describe("POST /api/rooms", () => {
  it("needs a signed-in player", async () => {
    expect((await call("POST", "/api/rooms", undefined, { seats: 2 })).status).toBe(401);
    expect((await call("POST", "/api/rooms", "forged-token", { seats: 2 })).status).toBe(401);
  });

  it("creates a private room with the host in seat 0 and returns its invite link", async () => {
    const room = await createRoom("anne-token", { seats: 3, mapSize: "medium", mapSeed: 77, turnTimerSeconds: 120 });
    expect(room).toMatchObject({
      seatCount: 3,
      mapSize: "medium",
      mapSeed: 77,
      turnTimerSeconds: 120,
      status: "open",
      isHost: true,
      hostSeat: 0,
      yourSeat: 0,
      matchId: null,
      seats: [{ index: 0, userId: ANNE, displayName: "Anne Bonny" }],
    });
    expect(room.inviteCode).toBe("invite-code-0000000001");
    expect(room.invitePath).toBe("/?view=join&invite=invite-code-0000000001");
  });

  it("defaults to a small map, a seed the server picks and a 24-hour turn", async () => {
    const room = await createRoom("anne-token", { seats: 2 });
    expect(room).toMatchObject({ mapSize: "small", mapSeed: 4242, turnTimerSeconds: 86400 });
  });

  it("refuses settings outside the game's limits", async () => {
    for (const bad of [
      {},
      { seats: 1 },
      { seats: 5 },
      { seats: 2.5 },
      { seats: "2" },
      { seats: 2, mapSize: "huge" },
      { seats: 2, mapSeed: 1.5 },
      { seats: 2, mapSeed: 2 ** 31 },
      { seats: 2, turnTimerSeconds: 10 },
      { seats: 2, turnTimerSeconds: 30 * 86400 },
    ]) {
      const res = await call("POST", "/api/rooms", "anne-token", bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await call("POST", "/api/rooms", "anne-token", "not json")).status).toBe(400);
  });

  it("allows five rooms an hour per player, then refuses with 429", async () => {
    for (let i = 0; i < 5; i++) await createRoom("anne-token");
    const res = await call("POST", "/api/rooms", "anne-token", { seats: 2 });
    expect(res.status).toBe(429);
    // Another player's allowance is their own.
    await createRoom("jack-token");
  });

  it("does not count a room that failed to be created against the player's five", async () => {
    const memory = store;
    let failures = 1;
    store = {
      ...memory,
      createRoom: async (room, limit) => {
        if (failures-- > 0) throw new Error("insert failed");
        return memory.createRoom(room, limit);
      },
    };
    services.store = store;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call("POST", "/api/rooms", "anne-token", { seats: 2 })).status).toBe(500);
    for (let i = 0; i < 5; i++) await createRoom("anne-token");
    expect((await call("POST", "/api/rooms", "anne-token", { seats: 2 })).status).toBe(429);
  });
});

describe("POST /api/rooms/join", () => {
  it("seats a signed-in player who opens the invite at the next free seat", async () => {
    const room = await createRoom("anne-token", { seats: 3 });
    const res = await call("POST", "/api/rooms/join", "jack-token", { inviteCode: room.inviteCode });
    expect(res.status).toBe(200);
    const joined = ((await res.json()) as { room: RoomBody }).room;
    expect(joined).toMatchObject({ id: room.id, yourSeat: 1, isHost: false, hostSeat: 0 });
    expect(joined.seats.map((s) => [s.index, s.userId])).toEqual([
      [0, ANNE],
      [1, JACK],
    ]);
  });

  it("keeps a player in the seat they hold when they open the link again", async () => {
    const room = await createRoom("anne-token", { seats: 3 });
    await call("POST", "/api/rooms/join", "jack-token", { inviteCode: room.inviteCode });
    const again = await call("POST", "/api/rooms/join", "jack-token", { inviteCode: room.inviteCode });
    expect(((await again.json()) as { room: RoomBody }).room.yourSeat).toBe(1);
    const host = await call("POST", "/api/rooms/join", "anne-token", { inviteCode: room.inviteCode });
    expect(((await host.json()) as { room: RoomBody }).room.yourSeat).toBe(0);
  });

  it("turns a player away from a full room", async () => {
    const room = await createRoom("anne-token", { seats: 2 });
    await call("POST", "/api/rooms/join", "jack-token", { inviteCode: room.inviteCode });
    const res = await call("POST", "/api/rooms/join", "mary-token", { inviteCode: room.inviteCode });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, code: "room_full" });
  });

  it("answers 404 for an unknown invite, and needs a signed-in player", async () => {
    expect((await call("POST", "/api/rooms/join", "jack-token", { inviteCode: "x".repeat(22) })).status).toBe(404);
    expect((await call("POST", "/api/rooms/join", "jack-token", {})).status).toBe(400);
    expect((await call("POST", "/api/rooms/join", undefined, { inviteCode: "x".repeat(22) })).status).toBe(401);
  });
});

describe("GET /api/rooms/:id", () => {
  it("shows the room to its members", async () => {
    const room = await createRoom("anne-token");
    const res = await call("GET", `/api/rooms/${room.id}`, "anne-token");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { room: RoomBody }).room.id).toBe(room.id);
  });

  it("does not reveal a room to anyone without a seat in it", async () => {
    const room = await createRoom("anne-token");
    expect((await call("GET", `/api/rooms/${room.id}`, "jack-token")).status).toBe(404);
    expect((await call("GET", `/api/rooms/${room.id}`)).status).toBe(401);
    expect((await call("GET", "/api/rooms/not-a-uuid", "anne-token")).status).toBe(404);
  });

  it("answers 404 to a malformed path instead of failing", async () => {
    for (const path of ["/api/rooms/%ZZ", "/api/rooms/%E0%A4%A/start"]) {
      const res = await call(path.endsWith("start") ? "POST" : "GET", path, "anne-token");
      expect(res.status, path).toBe(404);
    }
  });
});

describe("POST /api/rooms/:id/start", () => {
  async function fullRoom(): Promise<RoomBody> {
    const room = await createRoom("anne-token", { seats: 2, mapSize: "small", mapSeed: 31337 });
    await call("POST", "/api/rooms/join", "jack-token", { inviteCode: room.inviteCode });
    return room;
  }

  it("lets the host start a full room, creating the match from the room's setup data", async () => {
    const room = await fullRoom();
    const res = await call("POST", `/api/rooms/${room.id}/start`, "anne-token");
    expect(res.status).toBe(201);
    const started = ((await res.json()) as { room: RoomBody }).room;
    expect(started.status).toBe("started");
    expect(started.matchId).toEqual(expect.any(String));

    const match = await (store as ReturnType<typeof createMemoryOnlineStore>).peekMatch(started.matchId!);
    const state = match!.state as { G: { mapSeed: number; ships: Record<string, unknown> }; ctx: { numPlayers: number; phase: string }; _stateID: number };
    expect(state.G.mapSeed).toBe(31337);
    expect(state.ctx.numPlayers).toBe(2);
    expect(Object.keys(state.G.ships).sort()).toEqual(["0", "1"]);
    expect(match!.stateId).toBe(state._stateID);
    expect(match!.phase).toBe("draft");
  });

  it("seeds the match's dice and deck with the server's random seed, never the clock", async () => {
    services.newMatchSeed = newMatchSeed;
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 15, 12, 0, 0));
    const seedsOf = async () => {
      const room = await fullRoom();
      const started = ((await (await call("POST", `/api/rooms/${room.id}/start`, "anne-token")).json()) as { room: RoomBody }).room;
      const match = await (store as ReturnType<typeof createMemoryOnlineStore>).peekMatch(started.matchId!);
      return (match!.state as { plugins: { random: { data: { seed: string } } } }).plugins.random.data.seed;
    };
    const [a, b] = [await seedsOf(), await seedsOf()];
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });

  it("claims the start before building the match, so a second start is refused at once", async () => {
    const room = await fullRoom();
    const memory = store;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    store = {
      ...memory,
      startMatch: async (...args) => {
        await held;
        return memory.startMatch(...args);
      },
    };
    services.store = store;
    const first = call("POST", `/api/rooms/${room.id}/start`, "anne-token");
    const second = await call("POST", `/api/rooms/${room.id}/start`, "anne-token");
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "match_starting" });
    release();
    expect((await first).status).toBe(201);
  });

  it("lets the host start again if a start was claimed and never finished", async () => {
    let now = Date.UTC(2026, 9, 15, 12, 0, 0);
    store = createMemoryOnlineStore({ now: () => now });
    services.store = store;
    const room = await fullRoom();
    expect((await store.claimStart(room.id, ANNE)).outcome).toBe("claimed");
    expect((await call("POST", `/api/rooms/${room.id}/start`, "anne-token")).status).toBe(409);
    now += 3 * 60 * 1000;
    expect((await call("POST", `/api/rooms/${room.id}/start`, "anne-token")).status).toBe(201);
  });

  it("lets only the host start", async () => {
    const room = await fullRoom();
    expect((await call("POST", `/api/rooms/${room.id}/start`, "jack-token")).status).toBe(403);
    expect((await call("POST", `/api/rooms/${room.id}/start`, "mary-token")).status).toBe(404);
  });

  it("waits until every seat is taken", async () => {
    const room = await createRoom("anne-token", { seats: 3 });
    await call("POST", "/api/rooms/join", "jack-token", { inviteCode: room.inviteCode });
    const res = await call("POST", `/api/rooms/${room.id}/start`, "anne-token");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "seats_free" });
  });

  it("starts a room once: a second start answers 409, and nobody joins after", async () => {
    const room = await fullRoom();
    await call("POST", `/api/rooms/${room.id}/start`, "anne-token");
    expect((await call("POST", `/api/rooms/${room.id}/start`, "anne-token")).status).toBe(409);
    const late = await call("POST", "/api/rooms/join", "mary-token", { inviteCode: room.inviteCode });
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ code: "match_started" });
  });
});

describe("the rooms API with no backend configured", () => {
  it("answers 503, without touching anything", async () => {
    const res = await handleApiRequest(new Request("https://game.example/api/rooms", { method: "POST" }), {}, null);
    expect(res.status).toBe(503);
  });
});
