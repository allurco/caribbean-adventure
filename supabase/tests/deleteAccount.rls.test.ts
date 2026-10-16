/**
 * Deleting an account (#108) against a local Supabase: `POST /api/me/delete`
 * with the real services, the "deleted player" placeholder, the sign-in
 * identity removed, every row naming the profile still valid, and what a
 * client can no longer write. Skipped unless SUPABASE_DB_TESTS=1; run with
 * `npm run test:db` after `npx supabase start` (see `localStack.ts`).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { handleApiRequest, type ApiServices } from "../../server/handleApiRequest";
import { servicesFromEnv } from "../../server/services";
import { DELETED_PLAYER_NAME } from "../../src/online/displayName";
import { dbTestsEnabled, localStack, NO_SESSION, testPlayers, type LocalStack, type TestPlayer } from "./localStack";

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  deleted_at: string | null;
}

describe.skipIf(!dbTestsEnabled)("deleting an account (local Supabase)", () => {
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

  const deleteAccount = (player: TestPlayer) => api("POST", "/api/me/delete", player);

  async function profile(id: string): Promise<ProfileRow | null> {
    const { data, error } = await admin.from("profiles").select("id, display_name, avatar_url, deleted_at").eq("id", id).maybeSingle();
    expect(error).toBeNull();
    return data as ProfileRow | null;
  }

  async function openRoom(host: TestPlayer, seats = 2): Promise<{ id: string; inviteCode: string }> {
    const res = await api("POST", "/api/rooms", host, { seats, mapSize: "small", mapSeed: 21 });
    return ((await res.json()) as { room: { id: string; inviteCode: string } }).room;
  }

  async function seatsOf(roomId: string): Promise<{ seat_index: number; user_id: string }[]> {
    return (await admin.from("seats").select("seat_index, user_id").eq("room_id", roomId).order("seat_index")).data ?? [];
  }

  it("leaves a 'deleted player' placeholder with no avatar, and removes the sign-in identity", async () => {
    const anne = await players.create({ full_name: "Anne Bonny", avatar_url: "https://cdn.example/anne.png" });
    expect(await profile(anne.id)).toMatchObject({ display_name: "Anne Bonny", avatar_url: "https://cdn.example/anne.png", deleted_at: null });

    const res = await deleteAccount(anne);
    expect(res.status).toBe(200);

    const placeholder = await profile(anne.id);
    expect(placeholder).toMatchObject({ id: anne.id, display_name: DELETED_PLAYER_NAME, avatar_url: null });
    expect(placeholder?.deleted_at).not.toBeNull();
    // Public like any profile, so match records still name the seat.
    expect((await anon.from("profiles").select("display_name").eq("id", anne.id).single()).data).toEqual({ display_name: DELETED_PLAYER_NAME });
    const { data } = await admin.auth.admin.getUserById(anne.id);
    expect(data.user).toBeNull();
    // The token reaches nothing any more.
    expect((await api("GET", "/api/me/rooms", anne)).status).toBe(401);
  });

  it("keeps every column of the placeholder known: nothing personal can hide in a new one", async () => {
    const anne = await players.create();
    await deleteAccount(anne);
    const { data } = await admin.from("profiles").select("*").eq("id", anne.id).single();
    expect(Object.keys(data ?? {}).sort()).toEqual(["avatar_url", "created_at", "deleted_at", "display_name", "id", "updated_at"]);
  });

  it("lets the same email sign up again, as a new captain", async () => {
    const email = `rls-${randomUUID()}@example.test`;
    const password = "local-test-password-2";
    const first = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Mary Read" } });
    const client = createClient(stack.url, stack.anonKey, NO_SESSION);
    const session = (await client.auth.signInWithPassword({ email, password })).data.session!;
    const mary: TestPlayer = { id: first.data.user!.id, client, accessToken: session.access_token };
    expect((await deleteAccount(mary)).status).toBe(200);

    const again = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(again.error).toBeNull();
    const fresh = again.data.user!;
    expect(fresh.id).not.toBe(mary.id);
    expect(await profile(fresh.id)).toMatchObject({ display_name: `Captain ${fresh.id.replace(/-/g, "").slice(0, 6)}`, deleted_at: null });
    expect(await profile(mary.id)).toMatchObject({ display_name: DELETED_PLAYER_NAME });
    await admin.auth.admin.deleteUser(fresh.id);
  });

  it("keeps a started match whole: seats, host and the move log still name the placeholder", async () => {
    const anne = await players.create({ full_name: "Anne Bonny" });
    const jack = await players.create({ full_name: "Calico Jack" });
    const room = await openRoom(anne);
    await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode });
    const started = (await (await api("POST", `/api/rooms/${room.id}/start`, anne)).json()) as { room: { matchId: string } };
    const matchId = started.room.matchId;
    const view = (await (await api("GET", `/api/matches/${matchId}`, anne)).json()) as { state: { _stateID: number } };
    const move = { stateID: view.state._stateID, action: { type: "MAKE_MOVE", payload: { type: "pickCaptain", args: [0, "Sloop"] } } };
    expect((await api("POST", `/api/matches/${matchId}/actions`, anne, move)).status).toBe(200);

    expect((await deleteAccount(anne)).status).toBe(200);

    expect(await seatsOf(room.id)).toEqual([
      { seat_index: 0, user_id: anne.id },
      { seat_index: 1, user_id: jack.id },
    ]);
    expect((await admin.from("rooms").select("host_id, status").eq("id", room.id).single()).data).toEqual({ host_id: anne.id, status: "started" });
    expect((await admin.from("moves").select("user_id").eq("match_id", matchId)).data).toEqual([{ user_id: anne.id }]);
    const seen = (await (await api("GET", `/api/rooms/${room.id}`, jack)).json()) as { room: { seats: { displayName: string | null }[] } };
    expect(seen.room.seats.map((s) => s.displayName)).toEqual([DELETED_PLAYER_NAME, "Calico Jack"]);
    expect((await api("GET", `/api/matches/${matchId}`, jack)).status).toBe(200);
  });

  it("leaves the rooms still open: the seat freed, a hosted room without a host, an empty room closed", async () => {
    const anne = await players.create();
    const jack = await players.create();
    const hosted = await openRoom(anne, 3);
    await api("POST", "/api/rooms/join", jack, { inviteCode: hosted.inviteCode });
    const joined = await openRoom(jack, 3);
    await api("POST", "/api/rooms/join", anne, { inviteCode: joined.inviteCode });
    const alone = await openRoom(anne);

    expect((await deleteAccount(anne)).status).toBe(200);

    expect(await seatsOf(hosted.id)).toEqual([{ seat_index: 1, user_id: jack.id }]);
    expect((await admin.from("rooms").select("host_id").eq("id", hosted.id).single()).data).toEqual({ host_id: null });
    expect(await seatsOf(joined.id)).toEqual([{ seat_index: 0, user_id: jack.id }]);
    expect((await admin.from("rooms").select("host_id").eq("id", joined.id).single()).data).toEqual({ host_id: jack.id });
    expect((await admin.from("rooms").select("id").eq("id", alone.id)).data).toEqual([]);
  });

  it("is idempotent: deleting again changes nothing", async () => {
    const anne = await players.create();
    expect((await admin.rpc("delete_account", { p_user: anne.id })).error).toBeNull();
    const first = await profile(anne.id);
    expect((await admin.rpc("delete_account", { p_user: anne.id })).error).toBeNull();
    expect(await profile(anne.id)).toEqual(first);
    // The identity's deletion then runs it once more, from the trigger.
    expect((await admin.auth.admin.deleteUser(anne.id)).error).toBeNull();
    expect(await profile(anne.id)).toEqual(first);
  });

  it("anonymises the profile however the auth user is deleted (the dashboard, the admin API)", async () => {
    const anne = await players.create({ full_name: "Anne Bonny", avatar_url: "https://cdn.example/anne.png" });
    const jack = await players.create();
    const room = await openRoom(jack);
    await api("POST", "/api/rooms/join", anne, { inviteCode: room.inviteCode });

    expect((await admin.auth.admin.deleteUser(anne.id)).error).toBeNull();

    expect(await profile(anne.id)).toMatchObject({ display_name: DELETED_PLAYER_NAME, avatar_url: null });
    expect(await seatsOf(room.id)).toEqual([{ seat_index: 0, user_id: jack.id }]);
  });

  it("never erases a profile that a seat names", async () => {
    const anne = await players.create();
    const jack = await players.create();
    const room = await openRoom(anne);
    await api("POST", "/api/rooms/join", jack, { inviteCode: room.inviteCode });
    await api("POST", `/api/rooms/${room.id}/start`, anne);
    expect((await admin.from("profiles").delete().eq("id", anne.id)).error).not.toBeNull();
    expect(await profile(anne.id)).not.toBeNull();
  });

  it("lets a token that outlives the deletion change nothing on the placeholder", async () => {
    const anne = await players.create({ full_name: "Anne Bonny" });
    expect((await deleteAccount(anne)).status).toBe(200);
    // The access token is a signed JWT: PostgREST still accepts it until it expires.
    const rename = await anne.client.from("profiles").update({ display_name: "Anne Again" }).eq("id", anne.id).select();
    expect(rename.data ?? []).toEqual([]);
    const avatar = await anne.client.from("profiles").update({ avatar_url: "https://cdn.example/x.png" }).eq("id", anne.id).select();
    expect(avatar.data ?? []).toEqual([]);
    expect(await profile(anne.id)).toMatchObject({ display_name: DELETED_PLAYER_NAME, avatar_url: null });
  });

  it("lets no client mark a profile deleted, unmark it, or run the deletion", async () => {
    const anne = await players.create();
    const jack = await players.create();
    expect((await anne.client.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", anne.id)).error).not.toBeNull();
    for (const caller of [anne.client, anon]) {
      expect((await caller.rpc("delete_account", { p_user: jack.id })).error).not.toBeNull();
      expect((await caller.rpc("anonymise_profile", { p_user: jack.id })).error).not.toBeNull();
    }
    expect(await profile(jack.id)).toMatchObject({ deleted_at: null });

    await admin.rpc("delete_account", { p_user: anne.id });
    expect((await anne.client.from("profiles").update({ deleted_at: null }).eq("id", anne.id)).error).not.toBeNull();
    expect((await profile(anne.id))?.deleted_at).not.toBeNull();
  });

  it("deletes only the token's own account, whatever the body says", async () => {
    const anne = await players.create();
    const jack = await players.create({ full_name: "Calico Jack" });
    expect((await api("POST", "/api/me/delete", anne, { userId: jack.id, id: jack.id })).status).toBe(200);
    expect(await profile(jack.id)).toMatchObject({ display_name: "Calico Jack", deleted_at: null });
    expect((await admin.auth.admin.getUserById(jack.id)).data.user).not.toBeNull();
  });
});
