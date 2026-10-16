import { afterEach, describe, expect, it } from "vitest";
import { setTurnBarShowing, subscribeTurnBar, turnBarShowing } from "./turnBarPresence";

// Whether the board's HUD turn bar is up, for what sits over the board from
// outside it: the harbour link (#125, PR #306).
describe("turnBarPresence", () => {
  afterEach(() => setTurnBarShowing(false));

  it("is down until a board says it is up", () => {
    expect(turnBarShowing()).toBe(false);
    setTurnBarShowing(true);
    expect(turnBarShowing()).toBe(true);
  });

  it("tells subscribers when it changes, and only then, until they unsubscribe", () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeTurnBar(() => seen.push(turnBarShowing()));
    setTurnBarShowing(true);
    setTurnBarShowing(true);
    setTurnBarShowing(false);
    unsubscribe();
    setTurnBarShowing(true);
    expect(seen).toEqual([true, false]);
  });
});
