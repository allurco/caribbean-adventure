/**
 * A match's realtime channel (#114) against a local Supabase: Realtime
 * Authorization (the policies on `realtime.messages`) lets only the match's
 * seated players join its private channel, to listen; refuses every client
 * message, broadcast and presence alike; and carries the server's `changed`
 * signal, the state's version alone, after a move through `/api`, to private
 * subscribers only. Which seats are online the server keeps itself, in
 * `seats.last_seen_at`, from each seat's own reads and moves. Skipped unless
 * SUPABASE_DB_TESTS=1; run with `npm run test:db` after `npx supabase start`
 * (see `localStack.ts`).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { handleApiRequest, type ApiServices } from "../../server/handleApiRequest";
import { servicesFromEnv } from "../../server/services";
import { matchTopic } from "../../src/online/matchChannel";
import { dbTestsEnabled, localStack, NO_SESSION, testPlayers, type LocalStack, type TestPlayer } from "./localStack";

const WAIT_MS = 8000;
/** How long to wait for a message that must not come. */
const QUIET_MS = 1500;
/** A refused join errors only after about 5 s, so a test with several outlasts Vitest's default 5 s. */
const REFUSED_JOINS_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!dbTestsEnabled)("a match's realtime channel (local Supabase)", () => {
  let stack: LocalStack;
  let admin: SupabaseClient;
  let services: ApiServices;
  const players = testPlayers(() => stack, () => admin);
  const opened: { client: SupabaseClient; channel: RealtimeChannel }[] = [];

  beforeAll(() => {
    stack = localStack();
    admin = createClient(stack.url, stack.serviceKey, NO_SESSION);
    services = servicesFromEnv({ SUPABASE_URL: stack.url, SUPABASE_SECRET_KEY: stack.serviceKey })!;
  });

  afterEach(async () => {
    for (const { client, channel } of opened.splice(0)) await client.removeChannel(channel);
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
    return matchOf(await players.create(), await players.create());
  }

  async function matchOf(anne: TestPlayer, jack: TestPlayer): Promise<{ anne: TestPlayer; jack: TestPlayer; matchId: string }> {
    const created = (await (await api("POST", "/api/rooms", anne, { seats: 2, mapSize: "small", mapSeed: 13 })).json()) as {
      room: { id: string; inviteCode: string };
    };
    await api("POST", "/api/rooms/join", jack, { inviteCode: created.room.inviteCode });
    const started = (await (await api("POST", `/api/rooms/${created.room.id}/start`, anne)).json()) as { room: { matchId: string } };
    return { anne, jack, matchId: started.room.matchId };
  }

  interface Joined {
    channel: RealtimeChannel;
    status: string;
    signals: unknown[];
  }

  /** Joins the match's channel as `client`, private unless asked otherwise, as the app does; resolves on the first status. */
  async function join(client: SupabaseClient, matchId: string, { isPrivate = true } = {}): Promise<Joined> {
    await client.realtime.setAuth();
    const signals: unknown[] = [];
    const channel = client.channel(matchTopic(matchId), { config: { private: isPrivate } });
    channel.on("broadcast", { event: "changed" }, (message) => signals.push(message.payload));
    opened.push({ client, channel });
    const status = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve("NO ANSWER"), WAIT_MS);
      channel.subscribe((s) => {
        clearTimeout(timer);
        resolve(s);
      });
    });
    return { channel, status, signals };
  }

  async function until(check: () => boolean): Promise<void> {
    const end = Date.now() + WAIT_MS;
    while (!check() && Date.now() < end) await sleep(50);
  }

  it(
    "lets the match's seated players join its private channel, and nobody else",
    async () => {
      const { anne, jack, matchId } = await startedMatch();
      const mary = await players.create();
      expect((await join(anne.client, matchId)).status).toBe("SUBSCRIBED");
      expect((await join(jack.client, matchId)).status).toBe("SUBSCRIBED");
      expect((await join(mary.client, matchId)).status).toBe("CHANNEL_ERROR");
      const anon = createClient(stack.url, stack.anonKey, NO_SESSION);
      expect((await join(anon, matchId)).status).toBe("CHANNEL_ERROR");
    },
    REFUSED_JOINS_MS,
  );

  it(
    "refuses a player seated in another match its channel",
    async () => {
      const a = await startedMatch();
      const b = await startedMatch();
      expect((await join(a.anne.client, a.matchId)).status).toBe("SUBSCRIBED");
      expect((await join(a.anne.client, b.matchId)).status).toBe("CHANNEL_ERROR");
      expect((await join(b.jack.client, a.matchId)).status).toBe("CHANNEL_ERROR");
    },
    REFUSED_JOINS_MS,
  );

  it("carries the server's 'changed' signal after a move, with the state's version alone", async () => {
    const { anne, jack, matchId } = await startedMatch();
    const listening = await join(jack.client, matchId);
    expect(listening.status).toBe("SUBSCRIBED");
    const view = (await (await api("GET", `/api/matches/${matchId}`, anne)).json()) as { state: { _stateID: number } };
    const moved = await api("POST", `/api/matches/${matchId}/actions`, anne, {
      stateID: view.state._stateID,
      action: { type: "MAKE_MOVE", payload: { type: "pickCaptain", args: [0, "Sloop"] } },
    });
    expect(moved.status).toBe(200);
    await until(() => listening.signals.length > 0);
    expect(listening.signals).toEqual([{ v: view.state._stateID + 1 }]);
  });

  it(
    "sends the server's signal to private subscribers only: a public channel of the same name hears nothing",
    async () => {
      const { anne, jack, matchId } = await startedMatch();
      const listening = await join(jack.client, matchId);
      const outsider = await players.create();
      // A public channel needs no policy: it joins (while "Allow public access" is on), or is refused (once it is off).
      const publicly = await join(outsider.client, matchId, { isPrivate: false });
      const seatedPublicly = await join(anne.client, matchId, { isPrivate: false });
      const view = (await (await api("GET", `/api/matches/${matchId}`, anne)).json()) as { state: { _stateID: number } };
      await api("POST", `/api/matches/${matchId}/actions`, anne, {
        stateID: view.state._stateID,
        action: { type: "MAKE_MOVE", payload: { type: "pickCaptain", args: [0, "Sloop"] } },
      });
      await until(() => listening.signals.length > 0);
      expect(listening.signals).toEqual([{ v: view.state._stateID + 1 }]);
      await sleep(QUIET_MS);
      expect(publicly.signals).toEqual([]);
      expect(seatedPublicly.signals).toEqual([]);
    },
    REFUSED_JOINS_MS,
  );

  it("refuses every message a client sends on its match's channel: no broadcast, no presence", async () => {
    const { anne, jack, matchId } = await startedMatch();
    const sender = await join(anne.client, matchId);
    const listening = await join(jack.client, matchId);
    expect([sender.status, listening.status]).toEqual(["SUBSCRIBED", "SUBSCRIBED"]);
    await sender.channel.send({ type: "broadcast", event: "changed", payload: { v: 999 } });
    await sender.channel.httpSend("changed", { v: 998 }).catch(() => {});
    await sender.channel.track({ online: true }).catch(() => {});
    await listening.channel.track({ online: true }).catch(() => {});
    await sleep(QUIET_MS);
    expect(listening.signals).toEqual([]);
    expect(listening.channel.presenceState()).toEqual({});
    expect(sender.channel.presenceState()).toEqual({});
  });

  it("records each seat's own reads and moves on the server, and tells the seats who was seen lately, and nothing more", async () => {
    const { anne, jack, matchId } = await startedMatch();
    const first = (await (await api("GET", `/api/matches/${matchId}`, anne)).json()) as { online: string[]; state: { _stateID: number } };
    expect(first.online).toEqual(["0"]);
    const second = (await (await api("GET", `/api/matches/${matchId}?since=${first.state._stateID}`, jack)).json()) as {
      online: string[];
    };
    expect(second.online).toEqual(["0", "1"]);
    const room = (await admin.from("matches").select("room_id").eq("id", matchId).single()).data as { room_id: string };
    const seen = (await admin.from("seats").select("seat_index, last_seen_at").eq("room_id", room.room_id).order("seat_index"))
      .data as { seat_index: number; last_seen_at: string | null }[];
    expect(seen.map((s) => s.last_seen_at !== null)).toEqual([true, true]);
    expect(JSON.stringify(second)).not.toContain(new Date(seen[0].last_seen_at!).toISOString().slice(0, 16));
  });

  it("keeps the last-seen times from every client: members read their seats' other columns, never last_seen_at", async () => {
    const { anne, jack, matchId } = await startedMatch();
    await api("GET", `/api/matches/${matchId}`, jack);
    const room = (await admin.from("matches").select("room_id").eq("id", matchId).single()).data as { room_id: string };
    const seats = await anne.client.from("seats").select("seat_index, user_id, status, joined_at").eq("room_id", room.room_id);
    expect(seats.error).toBeNull();
    expect(seats.data).toHaveLength(2);
    for (const columns of ["last_seen_at", "seat_index, last_seen_at", "*"]) {
      const read = await anne.client.from("seats").select(columns).eq("room_id", room.room_id);
      expect(read.error, columns).not.toBeNull();
      expect(read.data ?? [], columns).toEqual([]);
    }
    const anon = createClient(stack.url, stack.anonKey, NO_SESSION);
    expect((await anon.from("seats").select("last_seen_at")).data ?? []).toEqual([]);
  });
});
