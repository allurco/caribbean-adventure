import { beforeEach, describe, expect, it } from "vitest";
import type { State } from "boardgame.io";
import { handleApiRequest, type ApiServices } from "./handleApiRequest";
import { createMemoryOnlineStore, type MemoryOnlineStore } from "./memoryOnlineStore";
import type { CaribbeanState } from "../src/game/types";
import { wrappedNeighbors } from "../src/game/hex";

// The move API (#113) through handleApiRequest, with the in-memory store and
// a token table: two captains in a started match.
const ANNE = "00000000-0000-4000-8000-00000000000a";
const JACK = "00000000-0000-4000-8000-00000000000b";
const MARY = "00000000-0000-4000-8000-00000000000c";
const TOKENS: Record<string, string> = { anne: ANNE, jack: JACK, mary: MARY };

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
    expect(same).toEqual({ ok: true, matchId, seat: "0", changed: false, stateID: state._stateID });
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

  it("refuses a move from a player who does not hold the current seat", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "jack");
    const res = await act(matchId, "jack", move(state._stateID, "pickCaptain", 0, "Sloop"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_your_turn" });
    const stranger = await act(matchId, "mary", move(state._stateID, "pickCaptain", 0, "Sloop"));
    expect(stranger.status).toBe(404);
    expect((await store.peekMatch(matchId))!.stateId).toBe(state._stateID);
    expect(await store.peekMoves(matchId)).toEqual([]);
  });

  it("rejects a move made against a stale state and sends the current view to refetch from", async () => {
    const matchId = await startedMatch();
    const { state } = await view(matchId, "anne");
    const res = await act(matchId, "anne", move(state._stateID - 1, "pickCaptain", 0, "Sloop"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as MatchBody;
    expect(body).toMatchObject({ code: "stale_state" });
    expect(body.state._stateID).toBe(state._stateID);
    expect(Object.keys(body.state.G.draftHands)).toEqual(["0"]);
    expect(await store.peekMoves(matchId)).toEqual([]);
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
  /** Seat 0 attacks seat 1, rolls the draw, and the draw goes to `winner`. */
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

  it("limits reads per player, far above one poll every four seconds", async () => {
    const matchId = await startedMatch();
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await call("GET", `/api/matches/${matchId}?since=0`, "anne")).status);
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});
