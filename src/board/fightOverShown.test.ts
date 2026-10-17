import { describe, expect, it } from "vitest";
import { closeFightOver, initialFightOver, newlyEnded, nextFightOver, settledKey } from "./fightOverShown";
import type { FightOverSignals } from "./fightOverShown";
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
  sunk: ["1"],
  leftDerelict: [],
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

describe("nextFightOver: the Fight over panel on the board (#380)", () => {
  const signals = (extra: Partial<FightOverSignals> = {}): FightOverSignals => ({
    lastRound: undefined,
    inCombat: false,
    npcInFight: null,
    announced: false,
    hotseat: true,
    ...extra,
  });

  it("opens as the round that ended a fight arrives, never for one stored when the board opened", () => {
    expect(nextFightOver(initialFightOver(undefined), signals({ lastRound: round() })).shown).toEqual(round());
    const loaded = initialFightOver(round());
    expect(nextFightOver(loaded, signals({ lastRound: round() }))).toBe(loaded);
  });

  it("stays open through later renders, and comes back the same object when nothing changed", () => {
    const open = nextFightOver(initialFightOver(undefined), signals({ lastRound: round() }));
    expect(nextFightOver(open, signals({ lastRound: structuredClone(round()) }))).toBe(open);
  });

  it("closes when a new fight is on, and by its Close button", () => {
    const open = nextFightOver(initialFightOver(undefined), signals({ lastRound: round() }));
    expect(nextFightOver(open, signals({ lastRound: round(), inCombat: true })).shown).toBeNull();
    expect(closeFightOver(open).shown).toBeNull();
  });

  it("in hotseat, closes as the hand-off announces the next captain's turn; a seat's own board keeps it", () => {
    const open = nextFightOver(initialFightOver(undefined), signals({ lastRound: round() }));
    expect(nextFightOver(open, signals({ lastRound: round(), announced: true })).shown).toBeNull();
    const seat = nextFightOver(initialFightOver(undefined), signals({ lastRound: round(), hotseat: false }));
    expect(nextFightOver(seat, signals({ lastRound: round(), announced: true, hotseat: false })).shown).toEqual(round());
  });

  it("an announcement already up when the panel opened does not close it", () => {
    const announcing = nextFightOver(initialFightOver(undefined), signals({ announced: true }));
    const open = nextFightOver(announcing, signals({ lastRound: round(), announced: true }));
    expect(open.shown).toEqual(round());
    expect(nextFightOver(open, signals({ lastRound: round(), announced: true })).shown).toEqual(round());
  });

  it("keeps the label of the NPC fought once the NPC is gone", () => {
    const fighting = nextFightOver(initialFightOver(undefined), signals({ inCombat: true, npcInFight: "Merchant" }));
    const sunk = nextFightOver(fighting, signals({ lastRound: round({ isNPCCombat: true, defenderId: "foe", sunk: ["foe"] }) }));
    expect(sunk.npcLabel).toBe("Merchant");
    expect(sunk.shown).not.toBeNull();
  });
});
