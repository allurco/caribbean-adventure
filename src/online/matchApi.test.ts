import { describe, expect, it } from "vitest";
import { createMatchApi } from "./matchApi";
import type { FetchLike } from "./roomApi";

const MATCH = "0f8fad5b-d9cb-469f-a165-70867728950e";

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, ...(init.body ? { body: JSON.parse(init.body) } : {}) });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

describe("the match API client (#113)", () => {
  it("reads the seat's view, or only whether it changed since a stateID", async () => {
    const { fetch, calls } = fakeFetch(200, { ok: true, matchId: MATCH, seat: "1", changed: false, stateID: 7 });
    const api = createMatchApi({ fetch, accessToken: async () => "tok" });
    expect(await api.getMatch(MATCH, 7)).toEqual({ ok: true, matchId: MATCH, seat: "1", changed: false, stateID: 7 });
    await api.getMatch(MATCH);
    expect(calls.map((c) => c.url)).toEqual([`/api/matches/${MATCH}?since=7`, `/api/matches/${MATCH}`]);
  });

  it("posts an action with the stateID it was made against", async () => {
    const { fetch, calls } = fakeFetch(200, { ok: true, matchId: MATCH, seat: "0", state: { _stateID: 8 } });
    const api = createMatchApi({ fetch, accessToken: async () => "tok" });
    const result = await api.sendAction(MATCH, 7, { type: "GAME_EVENT", payload: { type: "endTurn", args: [] } });
    expect(result).toMatchObject({ ok: true, state: { _stateID: 8 } });
    expect(calls).toEqual([
      { url: `/api/matches/${MATCH}/actions`, method: "POST", body: { stateID: 7, action: { type: "GAME_EVENT", payload: { type: "endTurn", args: [] } } } },
    ]);
  });

  it("explains the move API's refusals by their codes", async () => {
    const cases: [number, string, string][] = [
      [403, "not_your_turn", "It is not your turn."],
      [409, "stale_state", "The match moved on before your order arrived. Here is where it stands."],
      [400, "move_refused", "That order cannot be carried out."],
      [429, "rate_limited", "Too many orders at once. Slow down."],
      [409, "match_over", "This match is over."],
      [404, "not_found", "No match of yours behind that link."],
    ];
    for (const [status, code, message] of cases) {
      const { fetch } = fakeFetch(status, { ok: false, code, error: "any" });
      const result = await createMatchApi({ fetch, accessToken: async () => "tok" }).sendAction(MATCH, 1, {
        type: "MAKE_MOVE",
        payload: { type: "moveShip", args: [] },
      });
      expect(result, code).toEqual({ ok: false, status, code, error: message });
    }
  });
});
