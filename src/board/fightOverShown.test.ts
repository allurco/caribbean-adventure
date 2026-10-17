import { describe, expect, it } from "vitest";
import { newlyEnded, settledKey } from "./fightOverShown";
import type { SettledRound } from "../game/types";

const round = (extra: Partial<SettledRound> = {}): SettledRound => ({
  attackerId: "0",
  defenderId: "1",
  isNPCCombat: false,
  round: 2,
  volleys: [{ shooterId: "0", guns: 2, hits: 1, locations: { hull: 1, masts: 0, crew: 0 } }],
  fleeOutcome: null,
  fleeRolls: null,
  ended: true,
  ...extra,
});

describe("newlyEnded: the fight's end the board shows, as the round that ended it arrives (#380)", () => {
  it("a round that ended the fight, new since the round seen", () => {
    expect(newlyEnded("", round())).toEqual(round());
    expect(newlyEnded(settledKey(round({ round: 1, ended: false })), round())).toEqual(round());
  });

  it("not the round already seen, though it comes again as a new object (an online update)", () => {
    expect(newlyEnded(settledKey(round()), structuredClone(round()))).toBeNull();
  });

  it("not a round that left the fight going, and not none", () => {
    expect(newlyEnded("", round({ ended: false }))).toBeNull();
    expect(newlyEnded(settledKey(round()), undefined)).toBeNull();
  });
});
