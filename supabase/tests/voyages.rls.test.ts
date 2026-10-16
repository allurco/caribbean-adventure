/**
 * A player's voyages (`GET /api/me/rooms`, `list_voyages`) against a local
 * Supabase: only the caller's own rooms, whose turn (or fight step) it is and no state, and
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
  drafting: boolean;
  choosing: number[];
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
    expect(annes[0]).toMatchObject({ status: "started", yourSeat: 0, currentSeat: null, drafting: true, choosing: [0, 1], yourTurn: true });
    expect(annes[0].seats).toEqual([
      { index: 0, displayName: "Anne Bonny" },
      { index: 1, displayName: "Calico Jack" },
    ]);
    expect(annes[1]).toMatchObject({ status: "open", matchId: null, currentSeat: null, choosing: [], yourTurn: false });

    const jacks = await voyages(jack);
    expect(jacks.map((v) => v.roomId)).toEqual([room.id]);
    expect(jacks[0]).toMatchObject({ yourSeat: 1, currentSeat: null, choosing: [0, 1], yourTurn: true });

    const body = JSON.stringify(jacks);
    expect(body).not.toContain(room.inviteCode);
    expect(body).not.toContain(anne.id);
    expect(body).not.toContain('"state"');
  });

  /** A started match between two new captains, Anne at seat 0 and Jack at 1. */
  async function startedMatch(): Promise<{ anne: TestPlayer; jack: TestPlayer; matchId: string }> {
    const anne = await players.create({ full_name: "Anne Bonny" });
    const jack = await players.create({ full_name: "Calico Jack" });
    const room = await newRoom(anne);
    await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode });
    const started = (await (await api("POST", `/api/rooms/${room.id}/start`, anne)).json()) as { room: { matchId: string } };
    return { anne, jack, matchId: started.room.matchId };
  }

  /** Puts a fight in the match's stored state, the attacker its current player, as the combat phase keeps it. */
  async function setFight(matchId: string, currentPlayer: string, combat: Record<string, unknown>): Promise<void> {
    const read = await admin.from("matches").select("state").eq("id", matchId).single();
    expect(read.error).toBeNull();
    const state = read.data!.state as { G: Record<string, unknown>; ctx: Record<string, unknown> };
    const next = { ...state, G: { ...state.G, combat }, ctx: { ...state.ctx, phase: "combat", currentPlayer } };
    const write = await admin.from("matches").update({ state: next, phase: "combat" }).eq("id", matchId);
    expect(write.error).toBeNull();
  }

  it("in a fight, names the defender once it wins the draw, and sends no more of the fight", async () => {
    const { anne, jack, matchId } = await startedMatch();
    await setFight(matchId, "0", {
      stage: "chooseAction",
      attackerId: "0",
      defenderId: "1",
      seamanshipWinner: "1",
      isNPCCombat: false,
      log: ["secret-log"],
    });
    expect((await voyages(anne))[0]).toMatchObject({ currentSeat: 1, drafting: false, choosing: [], yourTurn: false });
    expect((await voyages(jack))[0]).toMatchObject({ currentSeat: 1, yourTurn: true });
    const raw = await admin.rpc("list_voyages", { p_user: jack.id, p_limit: 1 });
    expect(raw.error).toBeNull();
    expect((raw.data as { fight: unknown }[])[0].fight).toEqual({
      stage: "chooseAction",
      attacker_id: "0",
      seamanship_winner: "1",
      is_npc_combat: false,
    });
  });

  it("in a fight against an NPC, names the attacker whoever won the draw, and never the NPC's id", async () => {
    const { anne, jack, matchId } = await startedMatch();
    await setFight(matchId, "1", { stage: "chooseAction", attackerId: "1", defenderId: "npc-3", seamanshipWinner: "npc-3", isNPCCombat: true });
    expect((await voyages(jack))[0]).toMatchObject({ currentSeat: 1, yourTurn: true });
    expect((await voyages(anne))[0]).toMatchObject({ currentSeat: 1, yourTurn: false });
    const raw = await admin.rpc("list_voyages", { p_user: anne.id, p_limit: 1 });
    expect(JSON.stringify(raw.data)).not.toContain("npc-3");
  });

  it("in the draft, names every seat yet to pick, so a seat that has picked waits (#111)", async () => {
    const { anne, jack, matchId } = await startedMatch();
    const { state } = (await (await api("GET", `/api/matches/${matchId}`, jack)).json()) as { state: { _stateID: number } };
    const picked = await api("POST", `/api/matches/${matchId}/actions`, jack, {
      stateID: state._stateID,
      action: { type: "MAKE_MOVE", payload: { type: "pickCaptain", args: [0, "Sloop"] } },
    });
    expect(picked.status).toBe(200);
    expect((await voyages(anne))[0]).toMatchObject({ drafting: true, currentSeat: null, choosing: [0], yourTurn: true });
    expect((await voyages(jack))[0]).toMatchObject({ drafting: true, currentSeat: null, choosing: [0], yourTurn: false });
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
