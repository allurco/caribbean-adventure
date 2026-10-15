/**
 * The move API (#113) against a local Supabase: the `/api` routes with the
 * real services, the conditional write (`commit_move`) rejecting a stale
 * `stateID`, the move log, and the log closed to every client. Skipped
 * unless SUPABASE_DB_TESTS=1; run with `npm run test:db` after
 * `npx supabase start` (see `localStack.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { handleApiRequest, type ApiServices } from "../../server/handleApiRequest";
import { servicesFromEnv } from "../../server/services";
import { dbTestsEnabled, localStack, NO_SESSION, testPlayers, type LocalStack, type TestPlayer } from "./localStack";

interface ViewBody {
  ok: boolean;
  code?: string;
  seat: string;
  state: { _stateID: number; G: { draftHands: Record<string, unknown> }; plugins: { random?: { data?: unknown } } };
}

describe.skipIf(!dbTestsEnabled)("the move API (local Supabase)", () => {
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

  function api(method: string, path: string, player: TestPlayer, body?: unknown): Promise<Response> {
    return handleApiRequest(
      new Request(`http://localhost${path}`, {
        method,
        headers: { authorization: `Bearer ${player.accessToken}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      {},
      services,
    );
  }

  async function startedMatch(): Promise<{ anne: TestPlayer; jack: TestPlayer; matchId: string }> {
    const anne = await players.create();
    const jack = await players.create();
    const created = (await (await api("POST", "/api/rooms", anne, { seats: 2, mapSize: "small", mapSeed: 11 })).json()) as {
      room: { id: string; inviteCode: string };
    };
    await api("POST", "/api/rooms/join", jack, { inviteCode: created.room.inviteCode });
    const started = (await (await api("POST", `/api/rooms/${created.room.id}/start`, anne)).json()) as { room: { matchId: string } };
    return { anne, jack, matchId: started.room.matchId };
  }

  const pick = (stateID: number, index: number) => ({
    stateID,
    action: { type: "MAKE_MOVE", payload: { type: "pickCaptain", args: [index, "Sloop"] } },
  });

  it("plays a move, logs it, and rejects a second move made against the state before it", async () => {
    const { anne, jack, matchId } = await startedMatch();
    const view = (await (await api("GET", `/api/matches/${matchId}`, anne)).json()) as ViewBody;
    expect(Object.keys(view.state.G.draftHands)).toEqual(["0"]);
    expect(view.state.plugins.random?.data).toBeUndefined();
    const s0 = view.state._stateID;

    expect((await api("POST", `/api/matches/${matchId}/actions`, anne, pick(s0, 0))).status).toBe(200);
    const stale = await api("POST", `/api/matches/${matchId}/actions`, jack, pick(s0, 0));
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as ViewBody).code).toBe("stale_state");

    const log = (await admin.from("moves").select("seat_index, user_id, kind, name, args, state_id_before, state_id_after").eq("match_id", matchId))
      .data;
    expect(log).toEqual([
      { seat_index: 0, user_id: anne.id, kind: "move", name: "pickCaptain", args: [0, "Sloop"], state_id_before: s0, state_id_after: s0 + 1 },
    ]);
  });

  it("writes only one of two moves racing from the same state", async () => {
    const { anne, matchId } = await startedMatch();
    const s0 = ((await (await api("GET", `/api/matches/${matchId}`, anne)).json()) as ViewBody).state._stateID;
    const results = await Promise.all([0, 1].map((i) => api("POST", `/api/matches/${matchId}/actions`, anne, pick(s0, i))));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await admin.from("moves").select("id").eq("match_id", matchId)).data).toHaveLength(1);
    expect((await admin.from("matches").select("state_id").eq("id", matchId).single()).data).toEqual({ state_id: s0 + 1 });
  });

  it("refuses commit_move and stale writes at the database itself", async () => {
    const { anne, matchId } = await startedMatch();
    const { data } = await admin.from("matches").select("state, state_id").eq("id", matchId).single();
    const row = data as { state: unknown; state_id: number };
    const args = {
      p_match: matchId,
      p_state: row.state,
      p_state_id: row.state_id + 1,
      p_phase: "draft",
      p_finished: false,
      p_seat: 0,
      p_user: anne.id,
      p_kind: "move",
      p_name: "pickCaptain",
      p_args: [0, "Sloop"],
    };
    const byClient = await anne.client.rpc("commit_move", { ...args, p_expected_state_id: row.state_id });
    expect(byClient.error).not.toBeNull();
    const stale = await admin.rpc("commit_move", { ...args, p_expected_state_id: row.state_id - 1 });
    expect(stale.data).toBe(false);
    expect((await admin.from("matches").select("state_id").eq("id", matchId).single()).data).toEqual({ state_id: row.state_id });
  });

  it("keeps the move log from every client, its own players included", async () => {
    const { anne, matchId } = await startedMatch();
    const s0 = ((await (await api("GET", `/api/matches/${matchId}`, anne)).json()) as ViewBody).state._stateID;
    await api("POST", `/api/matches/${matchId}/actions`, anne, pick(s0, 0));
    for (const client of [anne.client, anon]) {
      const rows = await client.from("moves").select("*").eq("match_id", matchId);
      expect(rows.error !== null || (rows.data ?? []).length === 0).toBe(true);
    }
    const write = await anne.client.from("moves").insert({ match_id: matchId, seat_index: 0, kind: "move", name: "x", state_id_before: 0, state_id_after: 1 });
    expect(write.error).not.toBeNull();
  });
});
