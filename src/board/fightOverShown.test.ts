import { describe, expect, it } from "vitest";
import { closeFightOver, fightResultHold, initialFightOver, newlyEnded, nextFightOver, settledKey } from "./fightOverShown";
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
    playedKey: "",
    ...extra,
  });
  /** The panel once a round has arrived and the board has played it out. */
  const opened = (extra: Partial<FightOverSignals> = {}, r: SettledRound = round()) => {
    const arrived = nextFightOver(initialFightOver(undefined), signals({ lastRound: r, ...extra }));
    return nextFightOver(arrived, signals({ lastRound: r, playedKey: arrived.waitKey, ...extra }));
  };

  it("waits as the round that ended a fight arrives, and opens once the board has played it (the volleys, the sinking)", () => {
    const arrived = nextFightOver(initialFightOver(undefined), signals({ lastRound: round() }));
    expect(arrived.shown).toBeNull();
    expect(arrived.waiting).toEqual(round());
    expect(arrived.waitKey).not.toBe("");
    // Still playing: later renders keep it waiting
    expect(nextFightOver(arrived, signals({ lastRound: round() }))).toBe(arrived);
    const open = nextFightOver(arrived, signals({ lastRound: round(), playedKey: arrived.waitKey }));
    expect(open.shown).toEqual(round());
    expect(open.waiting).toBeNull();
    expect(open.waitKey).toBe("");
  });

  it("a round arriving already marked played still waits: a later fight ending on a byte-identical round", () => {
    const first = opened();
    const playedKey = nextFightOver(initialFightOver(undefined), signals({ lastRound: round() })).waitKey;
    // A new fight clears the round, then ends on the very same one
    const between = nextFightOver(closeFightOver(first), signals({ lastRound: undefined, playedKey }));
    const again = nextFightOver(between, signals({ lastRound: round(), playedKey }));
    expect(again.shown).toBeNull();
    expect(again.waiting).toEqual(round());
    expect(again.waitKey).not.toBe(playedKey);
    expect(nextFightOver(again, signals({ lastRound: round(), playedKey: again.waitKey })).shown).toEqual(round());
  });

  it("never opens for a round stored when the board opened", () => {
    const loaded = initialFightOver(round());
    expect(nextFightOver(loaded, signals({ lastRound: round(), playedKey: "wait-1" }))).toBe(loaded);
  });

  it("stays open through later renders, and comes back the same object when nothing changed", () => {
    const open = opened();
    expect(nextFightOver(open, signals({ lastRound: structuredClone(round()), playedKey: "wait-1" }))).toBe(open);
  });

  it("closes when a new fight is on, and by its Close button; a new fight drops a round still waiting", () => {
    const open = opened();
    expect(nextFightOver(open, signals({ lastRound: round(), inCombat: true })).shown).toBeNull();
    expect(closeFightOver(open).shown).toBeNull();
    const arrived = nextFightOver(initialFightOver(undefined), signals({ lastRound: round() }));
    expect(nextFightOver(arrived, signals({ lastRound: round(), inCombat: true })).waiting).toBeNull();
  });

  it("stays open until Close, whatever the turn: nothing closes it but Close and a new fight", () => {
    const open = opened();
    expect(nextFightOver(open, signals({ lastRound: round(), playedKey: "wait-1" }))).toBe(open);
  });

  it("keeps the label of the NPC fought once the NPC is gone", () => {
    const sunkRound = round({ isNPCCombat: true, defenderId: "foe", sunk: ["foe"] });
    const fighting = nextFightOver(initialFightOver(undefined), signals({ inCombat: true, npcInFight: "Merchant" }));
    const arrived = nextFightOver(fighting, signals({ lastRound: sunkRound }));
    const sunk = nextFightOver(arrived, signals({ lastRound: sunkRound, playedKey: arrived.waitKey }));
    expect(sunk.npcLabel).toBe("Merchant");
    expect(sunk.shown).toEqual(sunkRound);
  });
});

describe("fightResultHold: what the fight's end holds the next turn on (#380)", () => {
  const view = (waiting: SettledRound | null, shown: SettledRound | null) => ({ waiting, shown });

  it("in hotseat: the round waiting to open, then the panel open until Close", () => {
    expect(fightResultHold(view(round(), null), true)).toBe("waiting");
    expect(fightResultHold(view(null, round()), true)).toBe("open");
    expect(fightResultHold(view(null, null), true)).toBe("none");
  });

  it("solo and a seat's own board hold nothing", () => {
    expect(fightResultHold(view(round(), null), false)).toBe("none");
    expect(fightResultHold(view(null, round()), false)).toBe("none");
  });
});
