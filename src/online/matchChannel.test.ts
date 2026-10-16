import { describe, expect, it } from "vitest";
import { changedSignal, MATCH_CHANGED_EVENT, matchTopic, onlineSeatsFrom, parseChangedSignal, SEAT_PRESENCE } from "./matchChannel";

const MATCH = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";

describe("the match channel's contract (#114)", () => {
  it("names one private topic per match", () => {
    expect(matchTopic(MATCH)).toBe(`match:${MATCH}`);
    expect(MATCH_CHANGED_EVENT).toBe("changed");
    // The same channel whoever spells the id: the server's comes from Postgres, lower case.
    expect(matchTopic(MATCH.toUpperCase())).toBe(`match:${MATCH}`);
  });

  it("carries a 'changed' signal of the state version alone: no game state", () => {
    const signal = changedSignal(42);
    expect(signal).toEqual({ v: 42 });
    expect(Object.keys(signal)).toEqual(["v"]);
    expect(JSON.stringify(signal)).toBe('{"v":42}');
  });

  it("reads a signal's version, and nothing from anything else", () => {
    expect(parseChangedSignal({ v: 7 })).toBe(7);
    expect(parseChangedSignal({ v: 0 })).toBe(0);
    expect(parseChangedSignal({})).toBeNull();
    expect(parseChangedSignal(null)).toBeNull();
    expect(parseChangedSignal({ v: "7" })).toBeNull();
    expect(parseChangedSignal({ v: -1 })).toBeNull();
    expect(parseChangedSignal({ v: 1.5 })).toBeNull();
    expect(parseChangedSignal([7])).toBeNull();
  });

  it("tracks a seat's presence as an online flag and nothing more", () => {
    expect(SEAT_PRESENCE).toEqual({ online: true });
  });

  it("reads which seats are online from the presence keys, ignoring anything that is not a seat", () => {
    expect(onlineSeatsFrom(["1", "0", "1"])).toEqual(["0", "1"]);
    expect(onlineSeatsFrom(["3", "2"])).toEqual(["2", "3"]);
    expect(onlineSeatsFrom(["4", "-1", "x", "", "01", "anne"])).toEqual([]);
  });
});
