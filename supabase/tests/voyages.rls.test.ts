/**
 * A player's voyages (`GET /api/me/rooms`, `list_voyages`) against a local
 * Supabase: only the caller's own rooms, whose turn it is and no state, and
 * the function closed to every client. Skipped unless SUPABASE_DB_TESTS=1;
 * run with `npm run test:db` after `npx supabase start` (see `localStack.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { handleApiRequest, type ApiServices } from "../../server/handleApiRequest";
import { servicesFromEnv } from "../../server/services";
import { dbTestsEnabled, localStack, NO_SESSION, testPlayers, type LocalStack, type TestPlayer } from "./localStack";

interface Voyage {
  roomId: string;
  matchId: string | null;
  status: string;
  seats: { index: number; displayName: string | null }[];
  yourSeat: number;
  currentSeat: number | null;
  yourTurn: boolean;
  updatedAt: string;
}

describe.skipIf(!dbTestsEnabled)("a player's voyages (local Supabase)", () => {
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

  async function voyages(player: TestPlayer): Promise<Voyage[]> {
    const res = await api("GET", "/api/me/rooms", player);
    expect(res.status).toBe(200);
    return ((await res.json()) as { voyages: Voyage[] }).voyages;
  }

  async function newRoom(host: TestPlayer): Promise<{ id: string; inviteCode: string }> {
    const res = await api("POST", "/api/rooms", host, { seats: 2, mapSize: "small", mapSeed: 99 });
    return ((await res.json()) as { room: { id: string; inviteCode: string } }).room;
  }

  it("lists the caller's own rooms only, with names and whose turn it is, never the state", async () => {
    const anne = await players.create({ full_name: "Anne Bonny" });
    const jack = await players.create({ full_name: "Calico Jack" });
    const mary = await players.create();
    const waiting = await newRoom(anne);
    const room = await newRoom(anne);
    await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode });
    await api("POST", `/api/rooms/${room.id}/start`, anne);
    await newRoom(mary);

    const annes = await voyages(anne);
    expect(annes.map((v) => v.roomId)).toEqual([room.id, waiting.id]);
    expect(annes[0]).toMatchObject({ status: "started", yourSeat: 0, currentSeat: 0, turn: 1, yourTurn: true });
    expect(annes[0].seats).toEqual([
      { index: 0, displayName: "Anne Bonny" },
      { index: 1, displayName: "Calico Jack" },
    ]);
    expect(annes[1]).toMatchObject({ status: "open", matchId: null, currentSeat: null, yourTurn: false });

    const jacks = await voyages(jack);
    expect(jacks.map((v) => v.roomId)).toEqual([room.id]);
    expect(jacks[0]).toMatchObject({ yourSeat: 1, currentSeat: 0, yourTurn: false });

    const body = JSON.stringify(jacks);
    expect(body).not.toContain(room.inviteCode);
    expect(body).not.toContain(anne.id);
    expect(body).not.toContain('"state"');
  });

  it("does not let a client call list_voyages", async () => {
    const anne = await players.create();
    await newRoom(anne);
    for (const client of [anon, anne.client]) {
      const res = await client.rpc("list_voyages", { p_user: anne.id, p_limit: 50 });
      expect(res.error).not.toBeNull();
    }
  });

  it("returns at most fifty, whatever limit it is asked for", async () => {
    const anne = await players.create();
    await newRoom(anne);
    const res = await admin.rpc("list_voyages", { p_user: anne.id, p_limit: 1000 });
    expect(res.error).toBeNull();
    expect((res.data as unknown[]).length).toBeLessThanOrEqual(50);
  });
});
