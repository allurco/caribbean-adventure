import { beforeEach, describe, expect, it } from "vitest";
import { handleApiRequest, type ApiServices } from "./handleApiRequest";
import { createMemoryOnlineStore, type MemoryOnlineStore } from "./memoryOnlineStore";
import { VOYAGES_LIMIT, VOYAGES_READ_LIMIT } from "./voyages";

// "Your voyages": the signed-in player's own rooms and matches, through
// handleApiRequest with the in-memory store and a token table.
const ANNE = "00000000-0000-4000-8000-00000000000a";
const JACK = "00000000-0000-4000-8000-00000000000b";
const MARY = "00000000-0000-4000-8000-00000000000c";
const TOKENS: Record<string, string> = { anne: ANNE, jack: JACK, mary: MARY };
const NAMES: Record<string, string> = { [ANNE]: "Anne Bonny", [JACK]: "Calico Jack", [MARY]: "Mary Read" };

let store: MemoryOnlineStore;
let services: ApiServices;
let clock: number;
let codes: number;

beforeEach(() => {
  clock = Date.UTC(2026, 9, 15, 12);
  codes = 0;
  store = createMemoryOnlineStore({ displayName: (id) => NAMES[id] ?? null, now: () => clock });
  services = {
    auth: async (token) => TOKENS[token] ?? null,
    store,
    newInviteCode: () => `invite-code-${String(++codes).padStart(10, "0")}`,
    newMapSeed: () => 4242,
    newMatchSeed: () => "match-seed",
  };
});

function call(method: string, path: string, token?: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return handleApiRequest(
    new Request(`https://game.example${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    {},
    services,
  );
}

interface Voyage {
  roomId: string;
  matchId: string | null;
  status: string;
  seatCount: number;
  mapSize: string;
  seats: { index: number; displayName: string | null }[];
  yourSeat: number;
  currentSeat: number | null;
  drafting: boolean;
  choosing: number[];
  yourTurn: boolean;
  updatedAt: string;
}

async function voyages(token: string): Promise<Voyage[]> {
  const res = await call("GET", "/api/me/rooms", token);
  expect(res.status).toBe(200);
  return ((await res.json()) as { voyages: Voyage[] }).voyages;
}

async function openRoom(token: string, seats = 2): Promise<{ id: string; inviteCode: string }> {
  const res = await call("POST", "/api/rooms", token, { seats, mapSize: "small", mapSeed: 5 });
  return ((await res.json()) as { room: { id: string; inviteCode: string } }).room;
}

async function startedMatch(): Promise<{ roomId: string; matchId: string }> {
  const room = await openRoom("anne");
  await call("POST", "/api/rooms/join", "jack", { inviteCode: room.inviteCode });
  const started = (await (await call("POST", `/api/rooms/${room.id}/start`, "anne")).json()) as { room: { matchId: string } };
  return { roomId: room.id, matchId: started.room.matchId };
}

type MatchState = { G: Record<string, unknown>; ctx: Record<string, unknown> } & Record<string, unknown>;

/** Stores a new state for the match, as a move would. */
async function commitState(matchId: string, change: (state: MatchState) => MatchState, phase: string): Promise<void> {
  const match = (await store.peekMatch(matchId))!;
  const committed = await store.commitMove({
    matchId,
    expectedStateId: match.stateId,
    state: change(match.state as MatchState),
    stateId: match.stateId + 1,
    phase,
    finished: false,
    move: { seat: 0, userId: ANNE, kind: "move", name: "x", args: [], stateIdBefore: match.stateId, stateIdAfter: match.stateId + 1 },
  });
  expect(committed).toBe(true);
}

/** The state with `seat`'s captain picked, as the draft leaves it. */
function withCaptain(state: MatchState, seat: string): MatchState {
  const ships = state.G.ships as Record<string, Record<string, unknown>>;
  return { ...state, G: { ...state.G, ships: { ...ships, [seat]: { ...ships[seat], captain: { name: "Hidden" }, shipClass: "Sloop" } } } };
}

/** The state in a fight's phase, the attacker `currentPlayer` as boardgame.io keeps it. */
function withFight(state: MatchState, currentPlayer: string, combat: Record<string, unknown>): MatchState {
  return { ...state, G: { ...state.G, combat }, ctx: { ...state.ctx, phase: "combat", currentPlayer } };
}

describe("GET /api/me/rooms", () => {
  it("needs a signed-in player", async () => {
    expect((await call("GET", "/api/me/rooms")).status).toBe(401);
    expect((await call("GET", "/api/me/rooms", "forged")).status).toBe(401);
  });

  it("lists a room waiting in the lobby, with its captains and the caller's seat", async () => {
    clock += 1000;
    const room = await openRoom("anne", 3);
    expect(await voyages("anne")).toEqual([
      {
        roomId: room.id,
        matchId: null,
        status: "open",
        seatCount: 3,
        mapSize: "small",
        seats: [{ index: 0, displayName: "Anne Bonny" }],
        yourSeat: 0,
        currentSeat: null,
        drafting: false,
        choosing: [],
        yourTurn: false,
        updatedAt: new Date(clock).toISOString(),
      },
    ]);
  });

  it("lists only the rooms the caller holds a seat in", async () => {
    const annes = await openRoom("anne");
    await openRoom("jack");
    expect((await voyages("anne")).map((v) => v.roomId)).toEqual([annes.id]);
    expect(await voyages("mary")).toEqual([]);
  });

  it("says whose turn it is in a match under way, and whether it is the caller's", async () => {
    const { roomId, matchId } = await startedMatch();
    const [anne] = await voyages("anne");
    const [jack] = await voyages("jack");
    expect(anne).toMatchObject({ roomId, matchId, status: "started", yourSeat: 0, yourTurn: true });
    expect(jack).toMatchObject({ roomId, matchId, status: "started", yourSeat: 1, yourTurn: true });
    await commitState(matchId, (state) => ({ ...state, ctx: { ...state.ctx, phase: "main", currentPlayer: "0" } }), "main");
    expect((await voyages("anne"))[0]).toMatchObject({ currentSeat: 0, yourTurn: true });
    expect((await voyages("jack"))[0]).toMatchObject({ currentSeat: 0, yourTurn: false });
    expect(jack.seats).toEqual([
      { index: 0, displayName: "Anne Bonny" },
      { index: 1, displayName: "Calico Jack" },
    ]);
  });

  it("never sends a match's state, an invite code, a seed or another captain's account id", async () => {
    await startedMatch();
    const body = await (await call("GET", "/api/me/rooms", "jack")).text();
    for (const secret of ["state", "invite", "Seed", "seed", "G", ANNE, "match-seed"]) {
      expect(body, secret).not.toContain(`"${secret}"`);
    }
    expect(body).not.toContain(ANNE);
    expect(body).not.toContain("invite-code-");
  });

  it("in the draft, every seat yet to pick has its turn, and no one seat holds the turn (#111)", async () => {
    const { matchId } = await startedMatch();
    expect((await voyages("anne"))[0]).toMatchObject({ drafting: true, currentSeat: null, choosing: [0, 1], yourTurn: true });
    expect((await voyages("jack"))[0]).toMatchObject({ drafting: true, currentSeat: null, choosing: [0, 1], yourTurn: true });
    // Jack picks first; the turn stays at seat 0, still choosing
    await commitState(matchId, (state) => withCaptain(state, "1"), "draft");
    expect((await voyages("anne"))[0]).toMatchObject({ choosing: [0], yourTurn: true });
    expect((await voyages("jack"))[0]).toMatchObject({ choosing: [0], yourTurn: false });
  });

  it("says a match is drafting its captains until the draft is over", async () => {
    const { matchId } = await startedMatch();
    expect((await voyages("anne"))[0]).toMatchObject({ drafting: true });
    await commitState(matchId, (state) => ({ ...state, ctx: { ...state.ctx, phase: "main" } }), "main");
    expect((await voyages("anne"))[0]).toMatchObject({ drafting: false });
  });

  it("in a fight, names the seat that presses its step: the defender once it wins the draw", async () => {
    const { matchId } = await startedMatch();
    const fight = { stage: "chooseAction", attackerId: "0", defenderId: "1", seamanshipWinner: "1", isNPCCombat: false };
    await commitState(matchId, (state) => withFight(state, "0", fight), "combat");
    expect((await voyages("anne"))[0]).toMatchObject({ currentSeat: 1, yourTurn: false });
    expect((await voyages("jack"))[0]).toMatchObject({ currentSeat: 1, yourTurn: true });
  });

  it("in a fight, names the defender once the attacker has rolled its die of the draw, for the defender rolls its own (#347)", async () => {
    const { matchId } = await startedMatch();
    const fight = { stage: "defenderSeamanship", attackerId: "0", defenderId: "1", seamanshipWinner: null, isNPCCombat: false };
    await commitState(matchId, (state) => withFight(state, "0", fight), "combat");
    expect((await voyages("anne"))[0]).toMatchObject({ currentSeat: 1, yourTurn: false });
    expect((await voyages("jack"))[0]).toMatchObject({ currentSeat: 1, yourTurn: true });
  });

  it("in a fight, names the side answering the first volley, for it aims its own answer (#348)", async () => {
    const { matchId } = await startedMatch();
    const ambush = { stage: "returnFire", attackerId: "0", defenderId: "1", seamanshipWinner: null, isNPCCombat: false };
    await commitState(matchId, (state) => withFight(state, "0", ambush), "combat");
    expect((await voyages("anne"))[0]).toMatchObject({ currentSeat: 1, yourTurn: false });
    expect((await voyages("jack"))[0]).toMatchObject({ currentSeat: 1, yourTurn: true });
    const round2 = { ...ambush, seamanshipWinner: "1" };
    await commitState(matchId, (state) => withFight(state, "0", round2), "combat");
    expect((await voyages("anne"))[0]).toMatchObject({ currentSeat: 0, yourTurn: true });
  });

  it("in a fight, names the pursuer for the parting shot once the faster ship's flight is caught, not the ship that fled", async () => {
    const { matchId } = await startedMatch();
    const fight = { stage: "cannons", attackerId: "0", defenderId: "1", seamanshipWinner: "1", isNPCCombat: false, fleeOutcome: "caught" };
    await commitState(matchId, (state) => withFight(state, "0", fight), "combat");
    expect((await voyages("anne"))[0]).toMatchObject({ currentSeat: 0, yourTurn: true });
    expect((await voyages("jack"))[0]).toMatchObject({ currentSeat: 0, yourTurn: false });
  });

  it("in a fight against an NPC, names the attacker for every step, whoever won the draw", async () => {
    const { matchId } = await startedMatch();
    const fight = { stage: "chooseAction", attackerId: "1", defenderId: "npc-3", seamanshipWinner: "npc-3", isNPCCombat: true };
    await commitState(matchId, (state) => withFight(state, "1", fight), "combat");
    expect((await voyages("jack"))[0]).toMatchObject({ currentSeat: 1, yourTurn: true });
    expect((await voyages("anne"))[0]).toMatchObject({ currentSeat: 1, yourTurn: false });
  });

  // A fight the SQL would not project is no fight: the turn falls back to boardgame.io's current player.
  it.each([
    ["a stage that is not a combat stage", { stage: "boarding" }],
    ["no stage", { stage: undefined }],
    ["isNPCCombat as a number", { isNPCCombat: 0 }],
    ["isNPCCombat as an empty string", { isNPCCombat: "" }],
    ["no isNPCCombat", { isNPCCombat: undefined }],
  ])("reads a fight with %s as no fight", async (_name, broken) => {
    const { matchId } = await startedMatch();
    const fight = { stage: "chooseAction", attackerId: "0", defenderId: "1", seamanshipWinner: "1", isNPCCombat: false, ...broken };
    await commitState(matchId, (state) => withFight(state, "0", fight), "combat");
    expect((await voyages("jack"))[0]).toMatchObject({ currentSeat: 0, yourTurn: false });
  });

  it("sends of a fight no more than whose step it is", async () => {
    const { matchId } = await startedMatch();
    const fight = { stage: "cannons", attackerId: "0", defenderId: "1", seamanshipWinner: "0", isNPCCombat: false, log: ["secret-log"] };
    await commitState(matchId, (state) => withFight(state, "0", fight), "combat");
    const body = await (await call("GET", "/api/me/rooms", "jack")).text();
    expect(body).not.toContain("combat");
    expect(body).not.toContain("secret-log");
    expect(body).not.toContain("cannons");
  });

  it("marks a finished match with no one to play", async () => {
    const { matchId } = await startedMatch();
    const match = (await store.peekMatch(matchId))!;
    clock += 5000;
    await store.commitMove({
      matchId,
      expectedStateId: match.stateId,
      state: match.state,
      stateId: match.stateId + 1,
      phase: "main",
      finished: true,
      move: { seat: 0, userId: ANNE, kind: "move", name: "x", args: [], stateIdBefore: match.stateId, stateIdAfter: match.stateId + 1 },
    });
    expect((await voyages("anne"))[0]).toMatchObject({
      status: "finished",
      currentSeat: null,
      drafting: false,
      choosing: [],
      yourTurn: false,
      updatedAt: new Date(clock).toISOString(),
    });
  });

  it("puts the most recently changed first, and at most the latest fifty", async () => {
    const ids: string[] = [];
    for (let i = 0; i < VOYAGES_LIMIT + 2; i++) {
      clock += 60 * 60 * 1000; // past the room-creation allowance
      ids.push((await openRoom("anne")).id);
    }
    const listed = await voyages("anne");
    expect(listed).toHaveLength(VOYAGES_LIMIT);
    expect(listed.map((v) => v.roomId)).toEqual(ids.reverse().slice(0, VOYAGES_LIMIT));
  });

  it("limits how often a player may ask", async () => {
    for (let i = 0; i < VOYAGES_READ_LIMIT.limit; i++) expect((await call("GET", "/api/me/rooms", "anne")).status).toBe(200);
    const res = await call("GET", "/api/me/rooms", "anne");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "rate_limited" });
    expect((await call("GET", "/api/me/rooms", "jack")).status).toBe(200);
  });

  it("answers only GET", async () => {
    expect((await call("POST", "/api/me/rooms", "anne", {})).status).toBe(405);
  });
});
