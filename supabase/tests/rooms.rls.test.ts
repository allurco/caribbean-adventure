/**
 * Rooms, seats and matches (#112) against a local Supabase: row-level
 * security as each player's own client sees it, and the `/api` routes with
 * the real services (`servicesFromEnv`: the service role, Supabase Auth's
 * token check, the SQL functions). Skipped unless SUPABASE_DB_TESTS=1; run
 * with `npm run test:db` after `npx supabase start` (see `localStack.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { handleApiRequest, type ApiServices } from "../../server/handleApiRequest";
import { servicesFromEnv } from "../../server/services";
import { dbTestsEnabled, localStack, NO_SESSION, testPlayers, type LocalStack, type TestPlayer } from "./localStack";

interface RoomBody {
  id: string;
  inviteCode: string;
  status: string;
  yourSeat: number | null;
  matchId: string | null;
  seats: { index: number; userId: string; displayName: string | null }[];
}

describe.skipIf(!dbTestsEnabled)("rooms, seats and matches (local Supabase)", () => {
  let stack: LocalStack;
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let services: ApiServices;
  const players = testPlayers(() => stack, () => admin);

  beforeAll(() => {
    stack = localStack();
    admin = createClient(stack.url, stack.serviceKey, NO_SESSION);
    anon = createClient(stack.url, stack.anonKey, NO_SESSION);
    services = servicesFromEnv({ SUPABASE_URL: stack.url, SUPABASE_SECRET_KEY: stack.serviceKey })!;
  });

  afterAll(async () => {
    await players.deleteAll();
  });

  function api(method: string, path: string, player: TestPlayer | null, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (player) headers.authorization = `Bearer ${player.accessToken}`;
    return handleApiRequest(
      new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
      {},
      services,
    );
  }

  async function roomOf(res: Response): Promise<RoomBody> {
    const body = (await res.json()) as { room?: RoomBody; error?: string };
    if (!body.room) throw new Error(`no room: ${res.status} ${body.error}`);
    return body.room;
  }

  async function newRoom(host: TestPlayer, seats = 2): Promise<RoomBody> {
    return roomOf(await api("POST", "/api/rooms", host, { seats, mapSize: "small", mapSeed: 99 }));
  }

  it("creates a room through /api with the host in seat 0, under their profile name", async () => {
    const anne = await players.create({ full_name: "Anne Bonny" });
    const room = await newRoom(anne, 3);
    expect(room.status).toBe("open");
    expect(room.inviteCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(room.seats).toEqual([{ index: 0, userId: anne.id, displayName: "Anne Bonny" }]);
  });

  it("refuses a forged token", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/rooms", { method: "POST", headers: { authorization: "Bearer not-a-real-token" }, body: "{}" }),
      {},
      services,
    );
    expect(res.status).toBe(401);
  });

  it("lets members read their room and its seats, and nobody else", async () => {
    const anne = await players.create();
    const jack = await players.create();
    const stranger = await players.create();
    const room = await newRoom(anne);
    await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode });

    for (const member of [anne, jack]) {
      const rooms = await member.client.from("rooms").select("id, invite_code").eq("id", room.id);
      expect(rooms.data).toEqual([{ id: room.id, invite_code: room.inviteCode }]);
      const seats = await member.client.from("seats").select("seat_index, user_id").eq("room_id", room.id).order("seat_index");
      expect(seats.data).toEqual([
        { seat_index: 0, user_id: anne.id },
        { seat_index: 1, user_id: jack.id },
      ]);
    }
    for (const outsider of [stranger.client, anon]) {
      expect((await outsider.from("rooms").select("id").eq("id", room.id)).data ?? []).toEqual([]);
      expect((await outsider.from("seats").select("user_id").eq("room_id", room.id)).data ?? []).toEqual([]);
    }
    expect((await api("GET", `/api/rooms/${room.id}`, stranger)).status).toBe(404);
  });

  it("does not let a client write rooms, seats, matches or rate counters", async () => {
    const anne = await players.create();
    const jack = await players.create();
    const room = await newRoom(anne);

    const insertRoom = await jack.client
      .from("rooms")
      .insert({ host_id: jack.id, invite_code: "a".repeat(22), seat_count: 2, map_size: "small", map_seed: 1 });
    expect(insertRoom.error).not.toBeNull();
    const takeSeat = await jack.client.from("seats").insert({ room_id: room.id, seat_index: 1, user_id: jack.id });
    expect(takeSeat.error).not.toBeNull();
    const hijack = await anne.client.from("rooms").update({ seat_count: 4 }).eq("id", room.id).select();
    expect(hijack.error !== null || (hijack.data ?? []).length === 0).toBe(true);
    const leave = await anne.client.from("seats").delete().eq("room_id", room.id).select();
    expect(leave.error !== null || (leave.data ?? []).length === 0).toBe(true);
    const fakeMatch = await anne.client.from("matches").insert({ room_id: room.id, state: {}, state_id: 0 });
    expect(fakeMatch.error).not.toBeNull();
    const counters = await anne.client.from("rate_counters").select("*");
    expect(counters.error !== null || (counters.data ?? []).length === 0).toBe(true);

    expect((await admin.from("seats").select("user_id").eq("room_id", room.id)).data).toEqual([{ user_id: anne.id }]);
  });

  it("does not let a client call the server's functions", async () => {
    const anne = await players.create();
    const create = await anne.client.rpc("create_room", {
      p_host: anne.id,
      p_invite_code: "b".repeat(22),
      p_seat_count: 2,
      p_map_size: "small",
      p_map_seed: 1,
      p_turn_timer_seconds: 86400,
      p_limit: 1000,
      p_window_seconds: 1,
    });
    expect(create.error).not.toBeNull();
    const reset = await anne.client.rpc("consume_rate_limit", { p_user: anne.id, p_action: "create_room", p_limit: 1000, p_window_seconds: 1 });
    expect(reset.error).not.toBeNull();

    const jack = await players.create();
    const room = await newRoom(anne, 2);
    const join = await jack.client.rpc("join_room", { p_invite_code: room.inviteCode, p_user: jack.id });
    expect(join.error).not.toBeNull();
    const claim = await anne.client.rpc("claim_start", { p_room: room.id, p_user: anne.id });
    expect(claim.error).not.toBeNull();
    const start = await anne.client.rpc("start_match", { p_room: room.id, p_user: anne.id, p_state: {}, p_state_id: 0, p_phase: "draft" });
    expect(start.error).not.toBeNull();
    const release = await anne.client.rpc("release_start", { p_room: room.id });
    expect(release.error).not.toBeNull();
    for (const client of [anon, anne.client]) {
      const membership = await client.rpc("is_room_member", { p_room: room.id });
      if (client === anon) expect(membership.error).not.toBeNull();
      else expect(membership.data).toBe(true);
    }
    expect((await admin.from("seats").select("user_id").eq("room_id", room.id)).data).toEqual([{ user_id: anne.id }]);
    expect((await admin.from("rooms").select("status").eq("id", room.id).single()).data).toEqual({ status: "open" });
  });

  it("seats joiners in order, keeps a seat on a second visit, and turns away the next once full", async () => {
    const anne = await players.create();
    const jack = await players.create();
    const mary = await players.create();
    const room = await newRoom(anne, 2);
    expect((await roomOf(await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode }))).yourSeat).toBe(1);
    expect((await roomOf(await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode }))).yourSeat).toBe(1);
    const full = await api("POST", "/api/rooms/join", mary, { inviteCode: room.inviteCode });
    expect(full.status).toBe(409);
    expect((await api("POST", "/api/rooms/join", mary, { inviteCode: "c".repeat(22) })).status).toBe(404);
  });

  it("gives each of two racing joiners a different seat, never more than the room has", async () => {
    const anne = await players.create();
    const racers = await Promise.all([players.create(), players.create(), players.create()]);
    const room = await newRoom(anne, 3);
    const results = await Promise.all(racers.map((p) => api("POST", "/api/rooms/join", p, { inviteCode: room.inviteCode })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 409]);
    const seats = (await admin.from("seats").select("seat_index").eq("room_id", room.id)).data as { seat_index: number }[];
    expect(seats.map((s) => s.seat_index).sort()).toEqual([0, 1, 2]);
  });

  it("starts a full room's match from its setup data; members see the match row but never its state", async () => {
    const anne = await players.create();
    const jack = await players.create();
    const room = await newRoom(anne, 2);
    await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode });
    expect((await api("POST", `/api/rooms/${room.id}/start`, jack)).status).toBe(403);
    const started = await roomOf(await api("POST", `/api/rooms/${room.id}/start`, anne));
    expect(started.status).toBe("started");

    const stored = (await admin.from("matches").select("state, state_id, phase").eq("id", started.matchId!).single()).data as {
      state: { G: { mapSeed: number }; ctx: { numPlayers: number } };
      state_id: number;
      phase: string;
    };
    expect(stored.state.G.mapSeed).toBe(99);
    expect(stored.state.ctx.numPlayers).toBe(2);
    expect(stored.phase).toBe("draft");

    const meta = await jack.client.from("matches").select("id, state_id, phase").eq("room_id", room.id);
    expect(meta.data).toEqual([{ id: started.matchId, state_id: stored.state_id, phase: "draft" }]);
    const secret = await jack.client.from("matches").select("state").eq("room_id", room.id);
    expect(secret.error).not.toBeNull();
    const all = await jack.client.from("matches").select("*").eq("room_id", room.id);
    expect(all.error).not.toBeNull();

    expect((await api("POST", `/api/rooms/${room.id}/start`, anne)).status).toBe(409);
  });

  it("keeps the match row from anyone without a seat, and its state from every client, embedded selects included", async () => {
    const anne = await players.create();
    const jack = await players.create();
    const stranger = await players.create();
    const room = await newRoom(anne, 2);
    await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode });
    const started = await roomOf(await api("POST", `/api/rooms/${room.id}/start`, anne));

    for (const outsider of [stranger.client, anon]) {
      const rows = await outsider.from("matches").select("id").eq("id", started.matchId!);
      expect(rows.data ?? []).toEqual([]);
    }
    for (const select of ["*, matches(state)", "id, matches(*)", "id, matches(id, state)"]) {
      const embedded = await jack.client.from("rooms").select(select).eq("id", room.id);
      expect(embedded.error, select).not.toBeNull();
    }
    const fromSeats = await jack.client.from("seats").select("seat_index, rooms(matches(state))").eq("room_id", room.id);
    expect(fromSeats.error).not.toBeNull();
    const allowed = await jack.client.from("rooms").select("id, matches(id, state_id)").eq("id", room.id).single();
    expect(allowed.error).toBeNull();
    expect(JSON.stringify(allowed.data)).not.toContain("draftHands");
  });

  it("starts one match when the host starts a room twice at once", async () => {
    const anne = await players.create();
    const jack = await players.create();
    const room = await newRoom(anne, 2);
    await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode });
    const results = await Promise.all([1, 2, 3].map(() => api("POST", `/api/rooms/${room.id}/start`, anne)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const matches = (await admin.from("matches").select("id").eq("room_id", room.id)).data ?? [];
    expect(matches).toHaveLength(1);
  });

  it("seeds each match's dice with 128 random bits, not the clock", async () => {
    const anne = await players.create();
    const jack = await players.create();
    const seeds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const room = await newRoom(anne, 2);
      await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode });
      const started = await roomOf(await api("POST", `/api/rooms/${room.id}/start`, anne));
      const row = (await admin.from("matches").select("state").eq("id", started.matchId!).single()).data as {
        state: { plugins: { random: { data: { seed: string } } } };
      };
      seeds.push(row.state.plugins.random.data.seed);
    }
    for (const seed of seeds) expect(seed).toMatch(/^[0-9a-f]{32}$/);
    expect(seeds[0]).not.toBe(seeds[1]);
  });

  it("counts room creation in Postgres: five an hour, then 429", async () => {
    const anne = await players.create();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await api("POST", "/api/rooms", anne, { seats: 2 })).status);
    // A window boundary may fall inside the loop, so the sixth may still pass; never more than five in one window.
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    const counters = (await admin.from("rate_counters").select("count").eq("user_id", anne.id).eq("action", "create_room")).data as {
      count: number;
    }[];
    expect(counters).toHaveLength(1);
    if (counters[0].count === 6) expect(statuses[5]).toBe(429);
  });
});
