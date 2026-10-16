import { afterEach, describe, expect, it, vi } from "vitest";
import { STARTER_SHIP_CLASSES } from "../src/game/types";
import { applyAction, createMatchState, type MatchAction, type MatchState } from "./matchEngine";

/**
 * The server runs a match's moves per request, in whatever function instance
 * is warm (ADR 0008): the same seed and the same moves must give the same
 * state, whenever and wherever they run (#320).
 */

const move = (type: string, ...args: unknown[]): MatchAction => ({ type: "MAKE_MOVE", payload: { type, args } });
const endTurn: MatchAction = { type: "GAME_EVENT", payload: { type: "endTurn", args: [] } };

/** A solo match: the captain drafted, a mission taken at the home port's tavern, a few turns ended. */
function playMatch(): MatchState {
  let state = createMatchState(1, { mapSize: "small", mapSeed: 3 }, "c".repeat(32));
  for (const action of [move("pickCaptain", 0, STARTER_SHIP_CLASSES[0]), move("listenForRumors"), endTurn, endTurn, endTurn]) {
    const applied = applyAction(state, "0", action);
    if (!applied.ok) throw new Error(applied.error);
    state = applied.state;
  }
  return state;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("a match on the server (#320)", () => {
  it("reaches the same state from the same seed and moves, at another time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const first = playMatch();
    vi.setSystemTime(new Date("2027-06-15T12:34:56Z"));
    const second = playMatch();

    expect(first.G.ships["0"].activeMission?.id).toBe("mission-0-1");
    expect(second.G.ships["0"].activeMission?.id).toBe("mission-0-1");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
