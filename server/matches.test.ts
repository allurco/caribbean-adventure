import { beforeEach, describe, expect, it } from "vitest";
import type { State } from "boardgame.io";
import { handleApiRequest, type ApiServices } from "./handleApiRequest";
import { createMemoryOnlineStore, type MemoryOnlineStore } from "./memoryOnlineStore";
import { MOVE_LIMITS, READ_LIMIT } from "./matches";
import { ONLINE_WINDOW_SECONDS, SEEN_REFRESH_SECONDS } from "./seatSeen";
import { MATCH_POLL_MS } from "../src/online/matchSync";
import type { CaribbeanState } from "../src/game/types";
import { wrappedNeighbors } from "../src/game/hex";
import { silenceInvalidMoveLogs } from "../src/testSupport/silenceInvalidMoveLogs";

// These tests send refused moves on purpose; boardgame.io logs each one.
silenceInvalidMoveLogs();

// The move API (#113) through handleApiRequest, with the in-memory store and
// a token table: two captains in a started match.
const ANNE = "00000000-0000-4000-8000-00000000000a";
const JACK = "00000000-0000-4000-8000-00000000000b";
const MARY = "00000000-0000-4000-8000-00000000000c";
const NED = "00000000-0000-4000-8000-00000000000d";
const TOKENS: Record<string, string> = { anne: ANNE, jack: JACK, mary: MARY, ned: NED };

let store: MemoryOnlineStore;
let services: ApiServices;
let clock: number;

type View = State<CaribbeanState>;
interface MatchBody {
  ok: boolean;
  code?: string;
  matchId: string;
  seat: string;
  state: View;
  changed?: boolean;
  stateID?: number;
  error?: string;
  online?: string[];
}

function call(method: string, path: string, token?: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return handleApiRequest(
    new Request(`https://game.example${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    {},
    services,
  );
}

async function startedMatch(): Promise<string> {
  const created = (await (await call("POST", "/api/rooms", "anne", { seats: 2, mapSize: "small", mapSeed: 5 })).json()) as {
    room: { id: string; inviteCode: string };
  };
  await call("POST", "/api/rooms/join", "jack", { inviteCode: created.room.inviteCode });
  const started = (await (await call("POST", `/api/rooms/${created.room.id}/start`, "anne")).json()) as { room: { matchId: string } };
  return started.room.matchId;
}

/** A started match seating `tokens` in order: the first is the host, seat 0. */
async function startedMatchOf(tokens: readonly string[]): Promise<string> {
  const [host, ...guests] = tokens;
  const created = (await (await call("POST", "/api/rooms", host, { seats: tokens.length, mapSize: "small", mapSeed: 5 })).json()) as {
    room: { id: string; inviteCode: string };
  };
  for (const guest of guests) await call("POST", "/api/rooms/join", guest, { inviteCode: created.room.inviteCode });
  const started = (await (await call("POST", `/api/rooms/${created.room.id}/start`, host)).json()) as { room: { matchId: string } };
  return started.room.matchId;
}

/**
 * Makes `userId`'s next writes lose the compare-and-swap, one per entry of
 * `losses`, in order: each entry runs first (another seat's pick landing, or
 * nothing for a write that leaves the state as it was) and the write is then
 * refused, as the database refuses a write whose expected state id has moved on.
 */
function loseWritesOf(userId: string, losses: Array<() => Promise<unknown>>): void {
  const inner = services.store;
  services.store = {
    ...inner,
    async commitMove(update) {
      const loss = update.move.userId === userId ? losses.shift() : undefined;
      if (!loss) return inner.commitMove(update);
      await loss();
      return false;
    },
  };
}

async function view(matchId: string, token: string): Promise<MatchBody> {
  return (await (await call("GET", `/api/matches/${matchId}`, token)).json()) as MatchBody;
}

const move = (stateID: number, type: string, ...args: unknown[]) => ({ stateID, action: { type: "MAKE_MOVE", payload: { type, args } } });
const event = (stateID: number, type: string, ...args: unknown[]) => ({ stateID, action: { type: "GAME_EVENT", payload: { type, args } } });

function act(matchId: string, token: string, body: unknown): Promise<Response> {
  return call("POST", `/api/matches/${matchId}/actions`, token, body);
}

/** Both captains pick; the match is then in `main`, seat 0 to play. */
async function draftBoth(matchId: string): Promise<View> {
  let state = (await view(matchId, "anne")).state;
  for (const token of ["anne", "jack"]) {
    const res = await act(matchId, token, move(state._stateID, "pickCaptain", 0, "Sloop"));
    expect(res.status, token).toBe(200);
    state = ((await res.json()) as MatchBody).state;
  }
  return state;
}

beforeEach(() => {
  clock = Date.UTC(2026, 9, 15, 12, 0, 0);
  store = createMemoryOnlineStore({ now: () => clock });
  let codes = 0;
  services = {
    auth: async (token) => TOKENS[token] ?? null,
    store,
    newInviteCode: () => `invite-code-${String(++codes).padStart(10, "0")}`,
    newMapSeed: () => 1,
    newMatchSeed: () => "f".repeat(32),
    now: () => clock,
  };
});

describe("GET /api/matches/:id", () => {
  it("gives a seated player their own view: their hand only, no deck, no random seed", async () => {
    const matchId = await startedMatch();
    const whole = (await store.peekMatch(matchId))!.state as View;
    const anne = await view(matchId, "anne");
    expect(anne.seat).toBe("0");
    expect(anne.state._stateID).toBe(whole._stateID);
    expect(anne.state.ctx.phase).toBe("draft");
    expect(Object.keys(anne.state.G.draftHands)).toEqual(["0"]);
    expect(anne.state.G.draftHands["0"]).toEqual(whole.G.draftHands["0"]);
    expect(anne.state.G.captainDeck).toEqual([]);
    expect(anne.state.plugins.random?.data).toBeUndefined();
    expect((anne.state.ctx as { _random?: unknown })._random).toBeUndefined();
    expect(JSON.stringify(anne)).not.toContain("f".repeat(32));
    expect(JSON.stringify(anne.state)).not.toContain(JSON.stringify(whole.G.draftHands["1"]));

    const jack = await view(matchId, "jack");
    expect(jack.seat).toBe("1");
    expect(Object.keys(jack.state.G.draftHands)).toEqual(["1"]);
  });

  it("answers only whether anything changed when asked since the state the client holds", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const same = (await (await call("GET", `/api/matches/${matchId}?since=${state._stateID}`, "anne")).json()) as MatchBody;
    expect(same).toEqual({ ok: true, matchId, seat: "0", changed: false, stateID: state._stateID, online: ["0"] });
    await act(matchId, "anne", move(state._stateID, "pickCaptain", 0, "Sloop"));
    const moved = (await (await call("GET", `/api/matches/${matchId}?since=${state._stateID}`, "jack")).json()) as MatchBody;
    expect(moved.changed).toBe(true);
    expect(moved.state._stateID).toBe(state._stateID + 1);
  });

  it("shows a match to nobody but its seated players", async () => {
    const matchId = await startedMatch();
    expect((await call("GET", `/api/matches/${matchId}`, "mary")).status).toBe(404);
    expect((await call("GET", `/api/matches/${matchId}`)).status).toBe(401);
    expect((await call("GET", "/api/matches/not-a-uuid", "anne")).status).toBe(404);
  });
});

describe("POST /api/matches/:id/actions", () => {
  it("runs the current seat's move through the game's reducer and returns that seat's new view", async () => {
    const matchId = await startedMatch();
    const before = (await view(matchId, "anne")).state;
    const res = await act(matchId, "anne", move(before._stateID, "pickCaptain", 1, "Flute"));
    expect(res.status).toBe(200);
    const after = ((await res.json()) as MatchBody).state;
    expect(after._stateID).toBe(before._stateID + 1);
    expect(after.G.ships["0"].shipClass).toBe("Flute");
    expect(after.ctx.currentPlayer).toBe("1");
    expect(after.G.captainDeck).toEqual([]);
    expect(Object.keys(after.G.draftHands)).toEqual(["0"]);
    expect(after.plugins.random?.data).toBeUndefined();
    expect(JSON.stringify(after)).not.toContain("f".repeat(32));
    expect(((await store.peekMatch(matchId))!.state as View).plugins.random.data).toMatchObject({ seed: "f".repeat(32) });
    expect((await store.peekMatch(matchId))!.stateId).toBe(after._stateID);
  });

  it("appends each accepted move to the log: seat, move, args, state ids before and after", async () => {
    const matchId = await startedMatch();
    const s0 = (await view(matchId, "anne")).state._stateID;
    await act(matchId, "anne", move(s0, "pickCaptain", 0, "Sloop"));
    await act(matchId, "jack", move(s0 + 1, "pickCaptain", 1, "Flute"));
    const log = await store.peekMoves(matchId);
    expect(log.map(({ at, ...rest }) => (expect(at).toEqual(expect.any(String)), rest))).toEqual([
      { seat: 0, userId: ANNE, kind: "move", name: "pickCaptain", args: [0, "Sloop"], stateIdBefore: s0, stateIdAfter: s0 + 1 },
      { seat: 1, userId: JACK, kind: "move", name: "pickCaptain", args: [1, "Flute"], stateIdBefore: s0 + 1, stateIdAfter: s0 + 2 },
    ]);
  });

  it("lets every seat pick its captain at once in the draft, in any order, and then sails seat 0 first (#111)", async () => {
    const matchId = await startedMatch();
    const s0 = (await view(matchId, "jack")).state._stateID;
    const jack = await act(matchId, "jack", move(s0, "pickCaptain", 1, "Flute"));
    expect(jack.status).toBe(200);
    const afterJack = ((await jack.json()) as MatchBody).state;
    expect(afterJack.ctx).toMatchObject({ phase: "draft", currentPlayer: "0" });
    expect(afterJack.G.ships["1"].shipClass).toBe("Flute");
    // Anne sees that Jack has picked, never his hand, and until the draft is over not which captain or ship
    const anne = (await view(matchId, "anne")).state;
    expect(anne.G.ships["1"].draftPicked).toBe(true);
    expect(anne.G.ships["1"].captain).toBeUndefined();
    expect(anne.G.ships["1"].shipClass).toBeUndefined();
    expect(Object.keys(anne.G.draftHands)).toEqual(["0"]);

    // A seat picks once, from its own hand only
    for (const bad of [move(s0 + 1, "pickCaptain", 0, "Sloop"), move(s0 + 1, "pickCaptain", 2, "Sloop")]) {
      expect((await act(matchId, "jack", bad)).status, JSON.stringify(bad)).toBe(400);
    }

    const last = await act(matchId, "anne", move(s0 + 1, "pickCaptain", 0, "Sloop"));
    expect(last.status).toBe(200);
    const main = ((await last.json()) as MatchBody).state;
    expect(main.ctx).toMatchObject({ phase: "main", currentPlayer: "0" });
    // The draft over, every captain and ship is shown
    expect(main.G.ships["1"]).toMatchObject({ shipClass: "Flute", captain: expect.objectContaining({ name: expect.any(String) }) });
    expect(main.G.ships["1"]).not.toHaveProperty("draftPicked");
  });

  it("refuses a move from a player who does not hold the current seat", async () => {
    const matchId = await startedMatch();
    const { _stateID } = await draftBoth(matchId);
    const res = await act(matchId, "jack", move(_stateID, "spyglass", "1"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_your_turn" });
    const stranger = await act(matchId, "mary", move(_stateID, "spyglass", "1"));
    expect(stranger.status).toBe(404);
    expect((await store.peekMatch(matchId))!.stateId).toBe(_stateID);
    expect(await store.peekMoves(matchId)).toHaveLength(2);
  });

  it("rejects a move made against a stale state and sends the current view to refetch from", async () => {
    const matchId = await startedMatch();
    const state = await draftBoth(matchId);
    const current = state.ctx.currentPlayer === "0" ? "anne" : "jack";
    const res = await act(matchId, current, event(state._stateID - 1, "endTurn"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as MatchBody;
    expect(body).toMatchObject({ code: "stale_state" });
    expect(body.state._stateID).toBe(state._stateID);
    expect(body.state.G.captainDeck).toEqual([]);
    expect(await store.peekMoves(matchId)).toHaveLength(2);
  });

  it("takes two seats' captain picks made against the same state: draft picks commute (#111)", async () => {
    const matchId = await startedMatch();
    const s0 = (await view(matchId, "anne")).state._stateID;
    const jack = await act(matchId, "jack", move(s0, "pickCaptain", 1, "Flute"));
    expect(jack.status).toBe(200);
    // Anne picked from what she saw before Jack's pick reached her
    const anne = await act(matchId, "anne", move(s0, "pickCaptain", 0, "Sloop"));
    expect(anne.status).toBe(200);
    const after = ((await anne.json()) as MatchBody).state;
    expect(after.ctx).toMatchObject({ phase: "main", currentPlayer: "0" });
    expect(after.G.ships["0"].shipClass).toBe("Sloop");
    const log = await store.peekMoves(matchId);
    expect(log.map((m) => [m.seat, m.stateIdBefore, m.stateIdAfter])).toEqual([
      [1, s0, s0 + 1],
      [0, s0 + 1, after._stateID],
    ]);
  });

  it("takes both picks when two seats' picks race for the same write (#111)", async () => {
    const matchId = await startedMatch();
    const s0 = (await view(matchId, "anne")).state._stateID;
    const [a, b] = await Promise.all([
      act(matchId, "anne", move(s0, "pickCaptain", 0, "Sloop")),
      act(matchId, "jack", move(s0, "pickCaptain", 1, "Flute")),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await store.peekMoves(matchId)).toHaveLength(2);
    expect(((await store.peekMatch(matchId))!.state as View).ctx.phase).toBe("main");
  });

  it("retries a draft pick that lost its write to each other seat's pick, and lands it: four seats at once (#111)", async () => {
    const matchId = await startedMatchOf(["anne", "jack", "mary", "ned"]);
    const s0 = (await view(matchId, "anne")).state._stateID;
    // While Anne's pick is in flight, Jack's, Mary's and Ned's land first, each winning the write
    loseWritesOf(ANNE, [
      () => act(matchId, "jack", move(s0, "pickCaptain", 0, "Sloop")),
      () => act(matchId, "mary", move(s0, "pickCaptain", 0, "Sloop")),
      () => act(matchId, "ned", move(s0, "pickCaptain", 0, "Sloop")),
    ]);
    const anne = await act(matchId, "anne", move(s0, "pickCaptain", 0, "Sloop"));
    expect(anne.status).toBe(200);
    expect(((await anne.json()) as MatchBody).state.ctx).toMatchObject({ phase: "main", currentPlayer: "0" });
    expect((await store.peekMoves(matchId)).map((m) => m.seat)).toEqual([1, 2, 3, 0]);
  });

  it("retries a draft pick once after one lost write, and lands it (#111)", async () => {
    const matchId = await startedMatchOf(["anne", "jack", "mary"]);
    const s0 = (await view(matchId, "anne")).state._stateID;
    loseWritesOf(ANNE, [() => act(matchId, "jack", move(s0, "pickCaptain", 0, "Sloop"))]);
    const anne = await act(matchId, "anne", move(s0, "pickCaptain", 0, "Sloop"));
    expect(anne.status).toBe(200);
    expect(((await anne.json()) as MatchBody).state.ctx.phase).toBe("draft");
    expect((await store.peekMoves(matchId)).map((m) => [m.seat, m.stateIdBefore])).toEqual([
      [1, s0],
      [0, s0 + 1],
    ]);
  });

  it("gives up on a draft pick with 409 once it has lost more writes than the match has other seats (#111)", async () => {
    const matchId = await startedMatchOf(["anne", "jack", "mary", "ned"]);
    const s0 = (await view(matchId, "anne")).state._stateID;
    const nothing = async () => undefined;
    loseWritesOf(ANNE, [nothing, nothing, nothing, nothing, nothing]);
    const anne = await act(matchId, "anne", move(s0, "pickCaptain", 0, "Sloop"));
    expect(anne.status).toBe(409);
    expect(await anne.json()).toMatchObject({ code: "stale_state" });
    expect(await store.peekMoves(matchId)).toHaveLength(0);
  });

  it("still refuses a stale pick from a seat that has already picked (#111)", async () => {
    const matchId = await startedMatch();
    const s0 = (await view(matchId, "anne")).state._stateID;
    expect((await act(matchId, "jack", move(s0, "pickCaptain", 1, "Flute"))).status).toBe(200);
    const again = await act(matchId, "jack", move(s0, "pickCaptain", 0, "Sloop"));
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "stale_state" });
    expect(await store.peekMoves(matchId)).toHaveLength(1);
  });

  it("keeps every move outside the draft strict: a stale one is refused (#111)", async () => {
    const matchId = await startedMatch();
    const main = await draftBoth(matchId);
    const [current, next] = main.ctx.currentPlayer === "0" ? ["anne", "jack"] : ["jack", "anne"];
    clock += 1000;
    expect((await act(matchId, current, event(main._stateID, "endTurn"))).status).toBe(200);
    // The next seat ends its turn from the state before: refused, though the turn is now its own
    const stale = await act(matchId, next, event(main._stateID, "endTurn"));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "stale_state" });
  });

  it("rejects the loser of two concurrent writes of the same state", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const [a, b] = await Promise.all([
      act(matchId, "anne", move(state._stateID, "pickCaptain", 0, "Sloop")),
      act(matchId, "anne", move(state._stateID, "pickCaptain", 1, "Flute")),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await store.peekMoves(matchId)).toHaveLength(1);
  });

  it("refuses a move the game refuses, and writes nothing", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    for (const bad of [move(state._stateID, "pickCaptain", 9, "Sloop"), move(state._stateID, "pickCaptain", 0, "Galleon"), move(state._stateID, "noSuchMove")]) {
      const res = await act(matchId, "anne", bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await store.peekMatch(matchId))!.stateId).toBe(state._stateID);
    expect(await store.peekMoves(matchId)).toEqual([]);
  });

  it("accepts only the game's own moves and End Turn in the main phase: no other event, undo, redo or plugin action", async () => {
    const matchId = await startedMatch();
    const draft = (await view(matchId, "anne")).state._stateID;
    // The draft ends its own turns: End Turn is refused there.
    expect((await act(matchId, "anne", event(draft, "endTurn"))).status).toBe(400);

    const main = await draftBoth(matchId);
    expect(main.ctx.phase).toBe("main");
    const current = main.ctx.currentPlayer === "0" ? "anne" : "jack";
    for (const bad of [
      event(main._stateID, "setPhase", "combat"),
      event(main._stateID, "endPhase"),
      event(main._stateID, "endGame"),
      event(main._stateID, "setActivePlayers", { all: "combat" }),
      event(main._stateID, "endStage"),
      event(main._stateID, "endTurn", { next: "1" }),
      { stateID: main._stateID, action: { type: "UNDO", payload: { type: null, args: null } } },
      { stateID: main._stateID, action: { type: "REDO", payload: { type: null, args: null } } },
      { stateID: main._stateID, action: { type: "PLUGIN", payload: { type: "log", args: [] } } },
      { stateID: main._stateID, action: { type: "SYNC", state: {} } },
      { stateID: main._stateID, action: { type: "MAKE_MOVE", payload: { type: "moveShip", args: "1,2" } } },
      { stateID: main._stateID },
      "not an object",
    ]) {
      clock += 1000;
      const res = await act(matchId, current, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await store.peekMatch(matchId))!.stateId).toBe(main._stateID);

    const ended = await act(matchId, current, event(main._stateID, "endTurn"));
    expect(ended.status).toBe(200);
    const next = ((await ended.json()) as MatchBody).state;
    expect(next.ctx.currentPlayer).not.toBe(main.ctx.currentPlayer);
    expect((await store.peekMoves(matchId)).at(-1)).toMatchObject({ kind: "event", name: "endTurn", args: [] });
  });

  it("allows ten actions a second per player, then answers 429", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const statuses: number[] = [];
    // Refused moves count too: the limit guards the server, not the game.
    for (let i = 0; i < 11; i++) statuses.push((await act(matchId, "anne", move(state._stateID, "pickCaptain", 9, "Sloop"))).status);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(400));
    expect(statuses[10]).toBe(429);
    clock += 1000;
    expect((await act(matchId, "anne", move(state._stateID, "pickCaptain", 0, "Sloop"))).status).toBe(200);
  });
});

describe("what a request may cost (#113 security review)", () => {
  it("refuses move names that are not the game's own, inherited Object members included", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf", "__defineGetter__", "moveShip.bind", ""]) {
      clock += 1000;
      const res = await act(matchId, "anne", move(state._stateID, name, 0, "Sloop"));
      expect(res.status, name).toBe(400);
    }
    expect(await store.peekMoves(matchId)).toEqual([]);
  });

  it("refuses an action that names another seat as its player", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const res = await act(matchId, "anne", {
      stateID: state._stateID,
      action: { type: "MAKE_MOVE", payload: { type: "pickCaptain", args: [0, "Sloop"], playerID: "1" } },
    });
    expect(res.status).toBe(400);
    const own = await act(matchId, "anne", {
      stateID: state._stateID,
      action: { type: "MAKE_MOVE", payload: { type: "pickCaptain", args: [0, "Sloop"], playerID: "0" } },
    });
    expect(own.status).toBe(200);
  });

  it("refuses an oversized body with 413 before reading the match", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const res = await act(matchId, "anne", move(state._stateID, "pickCaptain", 0, "x".repeat(20_000)));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "payload_too_large" });
  });

  it("refuses more arguments than any move takes", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const res = await act(matchId, "anne", move(state._stateID, "pickCaptain", ...Array(9).fill(0)));
    expect(res.status).toBe(400);
  });

  it("stores no undo history, log or anything else that grows with every move", async () => {
    const matchId = await startedMatch();
    let state = await draftBoth(matchId);
    const sizes: number[] = [];
    for (let i = 0; i < 6; i++) {
      clock += 1000;
      const current = state.ctx.currentPlayer === "0" ? "anne" : "jack";
      const res = await act(matchId, current, event(state._stateID, "endTurn"));
      expect(res.status).toBe(200);
      state = ((await res.json()) as MatchBody).state;
      const stored = (await store.peekMatch(matchId))!.state as View & { _undo: unknown[]; _redo: unknown[]; deltalog?: unknown };
      expect(stored._undo).toEqual([]);
      expect(stored._redo).toEqual([]);
      expect(stored.deltalog).toBeUndefined();
      sizes.push(JSON.stringify(stored).length);
    }
    // NPCs move and spawn between turns, so allow a little drift, never steady growth.
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThan(5_000);
  });

  it("allows 120 actions a minute per player, whatever the pace", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const statuses: number[] = [];
    for (let i = 0; i < 121; i++) {
      if (i % 10 === 0) clock += 1000;
      statuses.push((await act(matchId, "anne", move(state._stateID, "pickCaptain", 9, "Sloop"))).status);
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
    expect(statuses[120]).toBe(429);
  });
});

describe("a fight between two seats (#113 review)", () => {
  /** Seat 0 attacks seat 1, fires the ambush, rolls round 2's draw, and the draw goes to `winner`. */
  async function fightAtChoice(winner: "0" | "1") {
    const matchId = await startedMatch();
    const main = await draftBoth(matchId);
    const attacker = main.ctx.currentPlayer;
    const defender = attacker === "0" ? "1" : "0";
    const tokenOf = (seat: string) => (seat === "0" ? "anne" : "jack");
    // Sail the defender alongside: test set-up, written straight into the store.
    const stored = (await store.peekMatch(matchId))!.state as View;
    stored.G.ships[defender].position = wrappedNeighbors(stored.G.ships[attacker].position, stored.G.wrap)[0];

    clock += 1000;
    let res = await act(matchId, tokenOf(attacker), move(main._stateID, "attackShip", defender));
    expect(res.status).toBe(200);
    let state = ((await res.json()) as MatchBody).state;
    expect(state.ctx.phase).toBe("combat");

    // Round 1 is the ambush (#346): no draw, and the broadside and the round's end are the attacker's steps.
    clock += 1000;
    expect((await act(matchId, tokenOf(attacker), move(state._stateID, "rollSeamanship"))).status).toBe(400);
    clock += 1000;
    expect((await act(matchId, tokenOf(defender), move(state._stateID, "rollCannons"))).status).toBe(403);
    clock += 1000;
    res = await act(matchId, tokenOf(attacker), move(state._stateID, "rollCannons"));
    expect(res.status).toBe(200);
    state = ((await res.json()) as MatchBody).state;
    expect(state.G.combat?.volleys?.[0]?.shooterId).toBe(attacker);
    clock += 1000;
    expect((await act(matchId, tokenOf(defender), move(state._stateID, "applyResolution"))).status).toBe(403);

    // Set-up: round 2, at the draw, whatever the ambush did, written straight into the store.
    Object.assign(((await store.peekMatch(matchId))!.state as View).G.combat!, { round: 2, stage: "seamanship", volleys: [] });
    // The defender may not roll the draw: it is the attacker's step.
    clock += 1000;
    expect((await act(matchId, tokenOf(defender), move(state._stateID, "rollSeamanship"))).status).toBe(403);
    clock += 1000;
    res = await act(matchId, tokenOf(attacker), move(state._stateID, "rollSeamanship"));
    expect(res.status).toBe(200);
    state = ((await res.json()) as MatchBody).state;
    // Let the draw fall to the side under test.
    const combat = ((await store.peekMatch(matchId))!.state as View).G.combat!;
    combat.seamanshipWinner = winner === "0" ? attacker : defender;
    combat.stage = "chooseAction";
    return { matchId, stateID: state._stateID, chooser: winner === "0" ? attacker : defender, other: winner === "0" ? defender : attacker, tokenOf };
  }

  for (const winner of ["0", "1"] as const) {
    it(`lets only the faster ship choose its action, never the other seat for it (${winner === "0" ? "attacker" : "defender"} wins the draw)`, async () => {
      const { matchId, stateID, chooser, other, tokenOf } = await fightAtChoice(winner);
      clock += 1000;
      const forced = await act(matchId, tokenOf(other), move(stateID, "chooseCombatAction", "fire"));
      expect(forced.status).toBe(403);
      expect(await forced.json()).toMatchObject({ code: "not_your_turn" });
      clock += 1000;
      const chosen = await act(matchId, tokenOf(chooser), move(stateID, "chooseCombatAction", "fire"));
      expect(chosen.status).toBe(200);
      expect(((await chosen.json()) as MatchBody).state.G.combat?.actionChosen).toBe("fire");
      expect((await store.peekMoves(matchId)).at(-1)).toMatchObject({ name: "chooseCombatAction", seat: Number(chooser) });
    });
  }
});

describe("the parting shot after a caught flight", () => {
  for (const fled of ["attacker", "defender"] as const) {
    it(`is fired only by the pursuer, never the ${fled} that fled`, async () => {
      const matchId = await startedMatch();
      const main = await draftBoth(matchId);
      const attacker = main.ctx.currentPlayer;
      const defender = attacker === "0" ? "1" : "0";
      const tokenOf = (seat: string) => (seat === "0" ? "anne" : "jack");
      const stored = (await store.peekMatch(matchId))!.state as View;
      stored.G.ships[defender].position = wrappedNeighbors(stored.G.ships[attacker].position, stored.G.wrap)[0];
      clock += 1000;
      const res = await act(matchId, tokenOf(attacker), move(main._stateID, "attackShip", defender));
      const { state } = (await res.json()) as MatchBody;
      // Set-up: the faster ship fled and was caught, written straight into the store.
      const fleeing = fled === "attacker" ? attacker : defender;
      const pursuer = fleeing === attacker ? defender : attacker;
      const combat = ((await store.peekMatch(matchId))!.state as View).G.combat!;
      Object.assign(combat, { stage: "cannons", seamanshipWinner: fleeing, actionChosen: "flee", fleeOutcome: "caught", fleeRolls: { pursuer: 6, fleeer: 1 } });

      clock += 1000;
      const refused = await act(matchId, tokenOf(fleeing), move(state._stateID, "rollCannons"));
      expect(refused.status).toBe(403);
      expect(await refused.json()).toMatchObject({ code: "not_your_turn" });
      clock += 1000;
      const fired = await act(matchId, tokenOf(pursuer), move(state._stateID, "rollCannons"));
      expect(fired.status).toBe(200);
      expect(((await fired.json()) as MatchBody).state.G.combat?.stage).toBe("resolution");
    });
  }
});

describe("reading a match (#113 review)", () => {
  it("answers 409 match_over to an action once the game has ended", async () => {
    const matchId = await startedMatch();
    const stored = (await store.peekMatch(matchId))!.state as View;
    stored.ctx.gameover = { winner: "0" };
    const res = await act(matchId, "anne", move(stored._stateID, "pickCaptain", 0, "Sloop"));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "match_over" });
  });

  it("answers ?since= from the state id alone, without loading the match's state", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    let loads = 0;
    const getMatch = store.getMatch.bind(store);
    store.getMatch = async (id) => {
      loads++;
      return getMatch(id);
    };
    const res = await call("GET", `/api/matches/${matchId}?since=${state._stateID}`, "anne");
    expect(await res.json()).toMatchObject({ changed: false });
    expect(loads).toBe(0);
  });

  it("limits reads per player, above a signalled read for each of a rival's moves at their limit plus the 4-second poll (#114)", async () => {
    expect(READ_LIMIT.windowSeconds).toBe(60);
    expect(READ_LIMIT.limit).toBeGreaterThanOrEqual(MOVE_LIMITS[1].limit + 60_000 / MATCH_POLL_MS);
    const matchId = await startedMatch();
    const statuses: number[] = [];
    for (let i = 0; i <= READ_LIMIT.limit; i++) statuses.push((await call("GET", `/api/matches/${matchId}?since=0`, "anne")).status);
    expect(statuses.slice(0, READ_LIMIT.limit).every((s) => s === 200)).toBe(true);
    expect(statuses[READ_LIMIT.limit]).toBe(429);
  });

  it("answers 400 to an empty ?since=, not as state id 0", async () => {
    const matchId = await startedMatch();
    const res = await call("GET", `/api/matches/${matchId}?since=`, "anne");
    expect(res.status).toBe(400);
    expect((await call("GET", `/api/matches/${matchId}?since=abc`, "anne")).status).toBe(400);
  });
});

describe("the realtime 'changed' signal (#114)", () => {
  function recordSignals(fail = false) {
    const sent: { matchId: string; stateId: number }[] = [];
    services = {
      ...services,
      signals: {
        async changed(matchId, stateId) {
          if (fail) throw new Error("realtime is down");
          sent.push({ matchId, stateId });
        },
      },
    };
    return sent;
  }

  it("signals the match's new state version after every accepted move", async () => {
    const sent = recordSignals();
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const res = await act(matchId, "anne", move(state._stateID, "pickCaptain", 0, "Sloop"));
    expect(res.status).toBe(200);
    const after = ((await res.json()) as MatchBody).state;
    expect(sent).toEqual([{ matchId, stateId: after._stateID }]);
  });

  it("sends nothing for a refused, stale or out-of-turn move, or a read", async () => {
    const sent = recordSignals();
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    expect((await act(matchId, "anne", move(state._stateID, "pickCaptain", 9, "Sloop"))).status).toBe(400);
    expect(sent).toEqual([]);
    // Draft picks commute (#111), so the stale and out-of-turn moves are tried once the draft is over
    const main = await draftBoth(matchId);
    sent.length = 0;
    const [current, other] = main.ctx.currentPlayer === "0" ? ["anne", "jack"] : ["jack", "anne"];
    expect((await act(matchId, current, event(main._stateID - 1, "endTurn"))).status).toBe(409);
    expect((await act(matchId, other, event(main._stateID, "endTurn"))).status).toBe(403);
    await call("GET", `/api/matches/${matchId}?since=${main._stateID}`, "jack");
    expect(sent).toEqual([]);
  });

  it("signals once for two racing moves: only the write that won", async () => {
    const sent = recordSignals();
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    await Promise.all([
      act(matchId, "anne", move(state._stateID, "pickCaptain", 0, "Sloop")),
      act(matchId, "anne", move(state._stateID, "pickCaptain", 1, "Flute")),
    ]);
    expect(sent).toHaveLength(1);
  });

  it("signals each of two seats' racing draft picks, the one retried on the state that won included (#111)", async () => {
    const sent = recordSignals();
    const matchId = await startedMatch();
    const s0 = (await view(matchId, "anne")).state._stateID;
    const responses = await Promise.all([
      act(matchId, "anne", move(s0, "pickCaptain", 0, "Sloop")),
      act(matchId, "jack", move(s0, "pickCaptain", 1, "Flute")),
    ]);
    const versions = await Promise.all(responses.map(async (r) => ((await r.json()) as MatchBody).state._stateID));
    expect(sent.map((s) => s.stateId).sort((a, b) => a - b)).toEqual([...versions].sort((a, b) => a - b));
    expect(sent.map((s) => s.stateId).sort((a, b) => a - b)).toEqual([s0 + 1, (await store.peekMatch(matchId))!.stateId]);
  });

  it("answers the move without waiting for the signal when the platform keeps work running after the response", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const deferred: Promise<unknown>[] = [];
    let release!: () => void;
    const sent: number[] = [];
    services = {
      ...services,
      defer: (work) => (deferred.push(work), true),
      signals: {
        changed: (_id, stateId) =>
          new Promise<void>((resolve) => {
            release = () => {
              sent.push(stateId);
              resolve();
            };
          }),
      },
    };
    const res = await act(matchId, "anne", move(state._stateID, "pickCaptain", 0, "Sloop"));
    expect(res.status).toBe(200);
    expect(sent).toEqual([]);
    expect(deferred).toHaveLength(1);
    release();
    await Promise.all(deferred);
    expect(sent).toEqual([state._stateID + 1]);
  });

  it("still accepts the move when the signal cannot be sent: clients fall back to polling", async () => {
    recordSignals(true);
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const matchId = await startedMatch();
      const { state } = await view(matchId, "anne");
      const res = await act(matchId, "anne", move(state._stateID, "pickCaptain", 0, "Sloop"));
      expect(res.status).toBe(200);
      expect(await store.peekMoves(matchId)).toHaveLength(1);
      expect(errors).toHaveLength(1);
    } finally {
      console.error = original;
    }
  });
});

describe("which seats were seen lately: server-side, from each seat's own reads and moves (#114)", () => {
  /** Counts the store's last-seen writes. */
  function countSeenWrites(): { count: number } {
    const writes = { count: 0 };
    const markSeatSeen = store.markSeatSeen.bind(store);
    store.markSeatSeen = async (...args) => {
      writes.count++;
      return markSeatSeen(...args);
    };
    return writes;
  }

  it("says a seat is online once it has read or moved, and the caller always is", async () => {
    const matchId = await startedMatch();
    const anne = await view(matchId, "anne");
    expect(anne.online).toEqual(["0"]);
    const jack = await view(matchId, "jack");
    expect(jack.online).toEqual(["0", "1"]);
    const since = (await (await call("GET", `/api/matches/${matchId}?since=${anne.state._stateID}`, "anne")).json()) as MatchBody;
    expect(since.online).toEqual(["0", "1"]);
    const moved = (await (await act(matchId, "anne", move(anne.state._stateID, "pickCaptain", 0, "Sloop"))).json()) as MatchBody;
    expect(moved.online).toEqual(["0", "1"]);
  });

  it("says a seat is offline once it has been silent for over a minute", async () => {
    const matchId = await startedMatch();
    await view(matchId, "jack");
    clock += (ONLINE_WINDOW_SECONDS - 1) * 1000;
    expect((await view(matchId, "anne")).online).toEqual(["0", "1"]);
    clock += 2000;
    expect((await view(matchId, "anne")).online).toEqual(["0"]);
  });

  it("writes a seat's last-seen time at most once every few seconds, however often it polls", async () => {
    const matchId = await startedMatch();
    const writes = countSeenWrites();
    for (let i = 0; i < 5; i++) {
      await call("GET", `/api/matches/${matchId}?since=0`, "anne");
      clock += 1000;
    }
    expect(writes.count).toBe(1);
    clock += SEEN_REFRESH_SECONDS * 1000;
    await call("GET", `/api/matches/${matchId}?since=0`, "anne");
    expect(writes.count).toBe(2);
  });

  it("records nobody who is not seated, and refuses them as before", async () => {
    const matchId = await startedMatch();
    const writes = countSeenWrites();
    expect((await call("GET", `/api/matches/${matchId}`, "mary")).status).toBe(404);
    expect((await act(matchId, "mary", move(0, "pickCaptain", 0, "Sloop"))).status).toBe(404);
    expect(writes.count).toBe(0);
  });

  it("sends only which seats were seen: no times, no user ids, nothing else about a player", async () => {
    const matchId = await startedMatch();
    await view(matchId, "jack");
    const body = (await (await call("GET", `/api/matches/${matchId}?since=0`, "anne")).json()) as MatchBody;
    expect(body.online).toEqual(["0", "1"]);
    const text = JSON.stringify(body);
    expect(text).not.toContain(JACK);
    expect(text).not.toContain(new Date(clock).toISOString().slice(0, 16));
  });

  it("plays on before the last-seen column exists (the migration not yet pushed): only the online dot is lost", async () => {
    const matchId = await startedMatch();
    const missingColumn = async () => {
      throw Object.assign(new Error('column seats.last_seen_at does not exist'), { code: "42703" });
    };
    let writes = 0;
    store.seatsLastSeen = missingColumn;
    store.markSeatSeen = async () => {
      writes++;
      return missingColumn();
    };
    const original = console.error;
    console.error = () => {};
    try {
      const read = await call("GET", `/api/matches/${matchId}`, "anne");
      expect(read.status).toBe(200);
      const body = (await read.json()) as MatchBody;
      expect(body.online).toEqual(["0"]);
      const since = await call("GET", `/api/matches/${matchId}?since=${body.state._stateID}`, "jack");
      expect(since.status).toBe(200);
      const moved = await act(matchId, "anne", move(body.state._stateID, "pickCaptain", 0, "Sloop"));
      expect(moved.status).toBe(200);
      expect(((await moved.json()) as MatchBody).online).toEqual(["0"]);
      // The read failed, so the write would fail too: it is not attempted, nor logged a second time.
      expect(writes).toBe(0);
    } finally {
      console.error = original;
    }
  });

  /** Logs when the seats' last-seen read starts and ends, around a timer tick, so a call made meanwhile shows in between. */
  function logSeenRead(order: string[]) {
    const seatsLastSeen = store.seatsLastSeen.bind(store);
    store.seatsLastSeen = async (roomId) => {
      order.push("seen:start");
      await new Promise((resolve) => setTimeout(resolve, 0));
      order.push("seen:end");
      return seatsLastSeen(roomId);
    };
  }

  it("reads when seats were last seen alongside loading the match's state, not before it", async () => {
    const matchId = await startedMatch();
    const order: string[] = [];
    logSeenRead(order);
    const getMatch = store.getMatch.bind(store);
    store.getMatch = async (id) => {
      order.push("match");
      return getMatch(id);
    };
    expect((await call("GET", `/api/matches/${matchId}`, "anne")).status).toBe(200);
    expect(order).toEqual(["seen:start", "match", "seen:end"]);
  });

  it("reads when seats were last seen alongside committing a move, not before it", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const order: string[] = [];
    logSeenRead(order);
    const commitMove = store.commitMove.bind(store);
    store.commitMove = async (entry) => {
      order.push("commit");
      return commitMove(entry);
    };
    expect((await act(matchId, "anne", move(state._stateID, "pickCaptain", 0, "Sloop"))).status).toBe(200);
    expect(order).toEqual(["seen:start", "commit", "seen:end"]);
  });

  it("records no seat for a malformed action, and still sends the seats online with a refused one", async () => {
    const matchId = await startedMatch();
    await view(matchId, "jack");
    clock += (SEEN_REFRESH_SECONDS + 1) * 1000;
    const writes = countSeenWrites();
    expect((await act(matchId, "anne", { action: "nonsense" })).status).toBe(400);
    expect(writes.count).toBe(0);
    const stale = await act(matchId, "anne", move(999, "pickCaptain", 0, "Sloop"));
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as MatchBody).online).toEqual(["0", "1"]);
    expect(writes.count).toBe(1);
  });

  it("records the seat after the response where the platform keeps work running, so no read or move waits on it", async () => {
    const matchId = await startedMatch();
    const deferred: Promise<unknown>[] = [];
    services = { ...services, defer: (work) => (deferred.push(work), true) };
    store.markSeatSeen = () => new Promise<void>(() => {});
    const read = await call("GET", `/api/matches/${matchId}`, "anne");
    expect(read.status).toBe(200);
    expect(deferred).toHaveLength(1);
  });
});
