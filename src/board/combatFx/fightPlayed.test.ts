import { describe, expect, it } from "vitest";
import { fightPlayedOut } from "./fightPlayed";

describe("fightPlayedOut: when a fight's beats have played out (#380)", () => {
  const at = (frame: number, holding: boolean, elapsedMs = 0, capMs = 20_000) => fightPlayedOut({ frame, elapsedMs, holding, capMs });

  it("never on the frame the watch began, though the director holds nothing yet", () => {
    expect(at(0, false)).toBe(false);
  });

  it("from the frame after, once the director no longer holds the fight", () => {
    expect(at(1, false)).toBe(true);
    expect(at(1, true)).toBe(false);
    expect(at(40, true, 3_000)).toBe(false);
    expect(at(41, false, 3_100)).toBe(true);
  });

  it("at the cap, though the director still holds it; never with no cap", () => {
    expect(at(900, true, 20_000)).toBe(true);
    expect(at(900, true, 1e9, Infinity)).toBe(false);
  });
});
