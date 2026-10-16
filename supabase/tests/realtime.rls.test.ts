/**
 * A match's realtime channel (#114) against a local Supabase: Realtime
 * Authorization (the policies on `realtime.messages`) lets only the match's
 * seated players join its private channel and share presence, refuses every
 * client a broadcast, and carries the server's `changed` signal, the state's
 * version alone, after a move through `/api`. Skipped unless
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
    const anne = await players.create();
    const jack = await players.create();
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

  /** Joins the match's private channel as `client`, with `key` as its presence key; resolves on the first status. */
  async function join(client: SupabaseClient, matchId: string, key: string): Promise<Joined> {
    await client.realtime.setAuth();
    const signals: unknown[] = [];
    const channel = client.channel(matchTopic(matchId), { config: { private: true, presence: { key } } });
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

  it("lets the match's seated players join its private channel, and nobody else", async () => {
    const { anne, jack, matchId } = await startedMatch();
    const mary = await players.create();
    expect((await join(anne.client, matchId, "0")).status).toBe("SUBSCRIBED");
    expect((await join(jack.client, matchId, "1")).status).toBe("SUBSCRIBED");
    expect((await join(mary.client, matchId, "1")).status).toBe("CHANNEL_ERROR");
    const anon = createClient(stack.url, stack.anonKey, NO_SESSION);
    expect((await join(anon, matchId, "0")).status).toBe("CHANNEL_ERROR");
  });

  it("carries the server's 'changed' signal after a move, with the state's version alone", async () => {
    const { anne, jack, matchId } = await startedMatch();
    const listening = await join(jack.client, matchId, "1");
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

  it("refuses a seated player's own broadcast: no client can send 'changed'", async () => {
    const { anne, jack, matchId } = await startedMatch();
    const sender = await join(anne.client, matchId, "0");
    const listening = await join(jack.client, matchId, "1");
    expect([sender.status, listening.status]).toEqual(["SUBSCRIBED", "SUBSCRIBED"]);
    await sender.channel.send({ type: "broadcast", event: "changed", payload: { v: 999 } });
    await sender.channel.httpSend("changed", { v: 998 }).catch(() => {});
    await sleep(QUIET_MS);
    expect(listening.signals).toEqual([]);
  });

  it("shares presence between the seats, keyed by seat with an online flag and nothing more", async () => {
    const { anne, jack, matchId } = await startedMatch();
    const a = await join(anne.client, matchId, "0");
    const j = await join(jack.client, matchId, "1");
    await a.channel.track({ online: true });
    await j.channel.track({ online: true });
    await until(() => Object.keys(a.channel.presenceState()).length === 2);
    const state = a.channel.presenceState();
    expect(Object.keys(state).sort()).toEqual(["0", "1"]);
    for (const metas of Object.values(state)) {
      for (const meta of metas) expect(Object.keys(meta).sort()).toEqual(["online", "presence_ref"]);
    }
  });
});
