import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchSync, MATCH_POLL_MS, type MatchGetResult, type MatchSendResult, type MatchSyncApi, type SeatView } from "./matchSync";

const MATCH = "0f8fad5b-d9cb-469f-a165-70867728950e";
const view = (stateID: number): SeatView => ({ _stateID: stateID, G: { n: stateID }, ctx: { currentPlayer: "0" } }) as unknown as SeatView;

function fakeApi() {
  const calls: string[] = [];
  let resolveSend: ((value: MatchSendResult) => void) | null = null;
  let rejectSend: ((reason: unknown) => void) | null = null;
  const api: MatchSyncApi & { nextGet: (since?: number) => MatchGetResult } = {
    getMatch: vi.fn(async (_id: string, since?: number) => {
      calls.push(`get since=${since ?? "-"}`);
      return api.nextGet(since);
    }),
    sendAction: vi.fn((_id: string, stateID: number, action: { payload: { type: string } }) => {
      calls.push(`send ${action.payload.type} at ${stateID}`);
      return new Promise<MatchSendResult>((resolve, reject) => {
        resolveSend = resolve;
        rejectSend = reject;
      });
    }),
    nextGet: (since?: number) => ({ ok: true as const, changed: true as const, seat: "0", state: view((since ?? 0) + 1) }),
  };
  return {
    api,
    calls,
    answer: (value: Awaited<ReturnType<MatchSyncApi["sendAction"]>>) => resolveSend!(value),
    /** The send never got an answer (the connection dropped). */
    lose: () => rejectSend!(new TypeError("Failed to fetch")),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the online match sync (#113)", () => {
  it("sends an action with the stateID it was made against, only the move's name and args, and shows the server's view", async () => {
    const { api, calls, answer } = fakeApi();
    const views: number[] = [];
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: () => {} });
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 2], playerID: "0", credentials: "x" } });
    await flush();
    expect(api.sendAction).toHaveBeenCalledWith(MATCH, 4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 2] } });
    answer({ ok: true, state: view(5) });
    await flush();
    expect(views).toEqual([5]);
    expect(calls).toEqual(["send moveShip at 4"]);
  });

  it("sends one action at a time, in order", async () => {
    const { api, calls, answer } = fakeApi();
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: () => {}, onError: () => {} });
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 2] } });
    sync.send(5, { type: "GAME_EVENT", payload: { type: "endTurn", args: [] } });
    await flush();
    expect(calls).toEqual(["send moveShip at 4"]);
    answer({ ok: true, state: view(5) });
    await flush();
    expect(calls).toEqual(["send moveShip at 4", "send endTurn at 5"]);
  });

  it("refetches the whole view and says why when the server refuses an action (stale, not your turn, invalid)", async () => {
    const { api, calls, answer } = fakeApi();
    const views: number[] = [];
    const errors: string[] = [];
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: (e) => errors.push(e) });
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 2] } });
    await flush();
    api.nextGet = () => ({ ok: true, changed: true, seat: "0", state: view(6) });
    answer({ ok: false, status: 409, code: "stale_state", error: "Someone moved first." });
    await flush();
    await flush();
    expect(calls).toEqual(["send moveShip at 4", "get since=-"]);
    expect(views).toEqual([6]);
    expect(errors).toEqual(["Someone moved first."]);
  });

  it("asks every few seconds whether the match changed, and fetches the view only when it did", async () => {
    const { api, calls } = fakeApi();
    const views: number[] = [];
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: () => {} });
    api.nextGet = (since) => ({ ok: true, changed: false, seat: "0", stateID: since! });
    sync.start();
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS);
    expect(calls).toEqual(["get since=4"]);
    expect(views).toEqual([]);
    api.nextGet = () => ({ ok: true, changed: true, seat: "0", state: view(9) });
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS);
    expect(views).toEqual([9]);
    api.nextGet = (since) => ({ ok: true, changed: false, seat: "0", stateID: since! });
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS);
    expect(calls.at(-1)).toBe("get since=9");
    sync.stop();
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS * 3);
    expect(calls).toHaveLength(3);
  });

  it("shows only the answer to the last of the actions queued: an earlier one would undo the later moves the board already shows", async () => {
    const { api, calls, answer } = fakeApi();
    const views: number[] = [];
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: () => {} });
    // A route of three hexes: the board shows each step at once and sends it on
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 0] } });
    sync.send(5, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [2, 0] } });
    sync.send(6, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [3, 0] } });
    for (const id of [5, 6, 7]) {
      await flush();
      answer({ ok: true, state: view(id) });
    }
    await flush();
    expect(calls).toEqual(["send moveShip at 4", "send moveShip at 5", "send moveShip at 6"]);
    expect(views).toEqual([7]);
  });

  it("holds back a whole view fetched while actions are queued (one asked for, or a refusal's refetch), showing only the one that answers the last of them", async () => {
    const { api, calls, answer } = fakeApi();
    const views: number[] = [];
    const errors: string[] = [];
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: (e) => errors.push(e) });
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 0] } });
    sync.send(5, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [2, 0] } });
    sync.send(6, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [3, 0] } });
    // A refetch asked for while the first is on its way sees the server before any of them
    api.nextGet = () => ({ ok: true, changed: true, seat: "0", state: view(4) });
    sync.refresh();
    await flush();
    answer({ ok: true, state: view(5) });
    await flush();
    // The second is refused (a 429): its refetch sees the server at 5, behind the board
    api.nextGet = () => ({ ok: true, changed: true, seat: "0", state: view(5) });
    answer({ ok: false, status: 429, code: "rate_limited", error: "Slow down." });
    await flush();
    await flush();
    // The third was made against 6, which the server never reached: refused, its refetch is the last word
    answer({ ok: false, status: 409, code: "stale_state", error: "Someone moved first." });
    await flush();
    await flush();
    expect(calls).toEqual(["get since=-", "send moveShip at 4", "send moveShip at 5", "get since=-", "send moveShip at 6", "get since=-"]);
    expect(errors).toEqual(["Slow down.", "Someone moved first."]);
    expect(views).toEqual([5]);
  });

  it("still shows the whole view when a later queued action is refused after an earlier answer was held back", async () => {
    const { api, answer } = fakeApi();
    const views: number[] = [];
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: () => {} });
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 0] } });
    sync.send(5, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [2, 0] } });
    await flush();
    answer({ ok: true, state: view(5) });
    await flush();
    api.nextGet = () => ({ ok: true, changed: true, seat: "0", state: view(5) });
    answer({ ok: false, status: 400, code: "invalid_move", error: "No." });
    await flush();
    await flush();
    expect(views).toEqual([5]);
  });

  it("does not poll while an action is on its way", async () => {
    const { api, calls, answer } = fakeApi();
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: () => {}, onError: () => {} });
    sync.start();
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 2] } });
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS * 2);
    expect(calls).toEqual(["send moveShip at 4"]);
    answer({ ok: true, state: view(5) });
    await flush();
    sync.stop();
  });

  it("refuses undo, redo and other events locally: the server would too", async () => {
    const { api, calls } = fakeApi();
    const errors: string[] = [];
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: () => {}, onError: (e) => errors.push(e) });
    sync.send(4, { type: "UNDO", payload: { type: null, args: null } });
    await flush();
    await flush();
    expect(calls).toEqual(["get since=-"]);
    expect(errors).toHaveLength(1);
  });

  it("after a send that never arrived, polls for the whole view until one succeeds, so no phantom move stays on the board", async () => {
    const { api, calls } = fakeApi();
    const views: number[] = [];
    const errors: string[] = [];
    api.sendAction = vi.fn(async () => {
      calls.push("send (fails)");
      throw new TypeError("Failed to fetch");
    });
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: (e) => errors.push(e) });
    // The refetch right after the failure fails too.
    let getsFail = 2;
    api.getMatch = vi.fn(async (_id: string, since?: number) => {
      calls.push(`get since=${since ?? "-"}`);
      if (getsFail-- > 0) throw new TypeError("Failed to fetch");
      return { ok: true as const, changed: true as const, seat: "0", state: view(4) };
    });
    sync.start();
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 2] } });
    await flush();
    await flush();
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS);
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS);
    // The server is still at 4: the whole view replaces the board's guess, though the stateID never moved.
    expect(views).toEqual([4]);
    expect(calls).toEqual(["send (fails)", "get since=-", "get since=-", "get since=-"]);
    expect(errors.length).toBeGreaterThan(0);
    // Once that poll succeeded, polling asks since= again.
    api.getMatch = vi.fn(async (_id: string, since?: number) => {
      calls.push(`get since=${since ?? "-"}`);
      return { ok: true as const, changed: false as const, seat: "0", stateID: 4 };
    });
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS);
    expect(calls.at(-1)).toBe("get since=4");
    sync.stop();
  });

  it("ignores a view older than the one the board holds (a late poll)", async () => {
    const { api, answer } = fakeApi();
    const views: number[] = [];
    let release!: () => void;
    api.getMatch = vi.fn(
      () =>
        new Promise<MatchGetResult>((resolve) => {
          release = () => resolve({ ok: true, changed: true, seat: "0", state: view(4) });
        }),
    );
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: () => {} });
    sync.refresh();
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 2] } });
    await flush();
    answer({ ok: true, state: view(6) });
    await flush();
    release();
    await flush();
    expect(views).toEqual([6]);
  });

  it("never leaves the board stale when a whole view fetched during the last action is newer than that action's answer", async () => {
    const { api, calls, answer } = fakeApi();
    const views: number[] = [];
    let release: (() => void) | undefined;
    // The server takes the action (8), then another seat moves (9); the board's first GET is served after both
    api.getMatch = vi.fn((_id: string, since?: number) => {
      calls.push(`get since=${since ?? "-"}`);
      if (since === undefined && release === undefined) {
        return new Promise<MatchGetResult>((resolve) => {
          release = () => resolve({ ok: true, changed: true, seat: "0", state: view(9) });
        });
      }
      const result: MatchGetResult = since === 9 ? { ok: true, changed: false, seat: "0", stateID: 9 } : { ok: true, changed: true, seat: "0", state: view(9) };
      return Promise.resolve(result);
    });
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 7, onView: (v) => views.push(v._stateID), onError: () => {} });
    sync.start();
    sync.refresh();
    sync.send(7, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 0] } });
    await flush();
    release!();
    await flush();
    answer({ ok: true, state: view(8) });
    await flush();
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS);
    expect(views.at(-1)).toBe(9);
    sync.stop();
  });

  it("asks only whether the match changed again once the last answer is shown, after a whole view was held back", async () => {
    const { api, calls, answer, lose } = fakeApi();
    const views: number[] = [];
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: () => {} });
    sync.start();
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 0] } });
    sync.send(5, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [2, 0] } });
    await flush();
    // The first arrived, but its answer was lost: the refetch (held back, the second is queued) sees 5
    api.nextGet = () => ({ ok: true, changed: true, seat: "0", state: view(5) });
    lose();
    await flush();
    await flush();
    answer({ ok: true, state: view(6) });
    await flush();
    api.nextGet = (since) => (since === undefined ? { ok: true, changed: true, seat: "0", state: view(6) } : { ok: true, changed: false, seat: "0", stateID: 6 });
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS);
    expect(calls).toEqual(["send moveShip at 4", "get since=-", "send moveShip at 5", "get since=6"]);
    expect(views).toEqual([6]);
    sync.stop();
  });

  it("keeps asking for the whole view after a refusal whose refetch came back refused too (429, 5xx)", async () => {
    const { api, calls, answer } = fakeApi();
    const views: number[] = [];
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: () => {} });
    api.nextGet = () => ({ ok: false, status: 429, code: "rate_limited", error: "Slow down." });
    sync.start();
    sync.send(4, { type: "MAKE_MOVE", payload: { type: "moveShip", args: [1, 2] } });
    await flush();
    answer({ ok: false, status: 409, code: "stale_state", error: "Someone moved first." });
    await flush();
    await flush();
    // The server is still at 4: only a whole view clears the board's guess.
    api.nextGet = (since) => (since === undefined ? { ok: true, changed: true, seat: "0", state: view(4) } : { ok: true, changed: false, seat: "0", stateID: 4 });
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS);
    expect(calls.slice(-2)).toEqual(["get since=-", "get since=-"]);
    expect(views).toEqual([4]);
    sync.stop();
  });

  it("keeps asking for the whole view after an action it cannot send, if that refetch is refused", async () => {
    const { api, calls } = fakeApi();
    const views: number[] = [];
    const sync = createMatchSync({ api, matchId: MATCH, initialStateID: 4, onView: (v) => views.push(v._stateID), onError: () => {} });
    api.nextGet = () => ({ ok: false, status: 503, code: "internal", error: "Down." });
    sync.start();
    sync.send(4, { type: "UNDO", payload: { type: null, args: null } });
    await flush();
    await flush();
    api.nextGet = (since) => (since === undefined ? { ok: true, changed: true, seat: "0", state: view(4) } : { ok: true, changed: false, seat: "0", stateID: 4 });
    await vi.advanceTimersByTimeAsync(MATCH_POLL_MS);
    expect(calls).toEqual(["get since=-", "get since=-"]);
    expect(views).toEqual([4]);
    sync.stop();
  });
});
