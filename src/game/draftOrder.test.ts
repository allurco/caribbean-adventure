import { describe, expect, it } from "vitest";
import { draftOver, everySeatPicked, hasPicked, nextToPick } from "./draftOrder";
import type { CaribbeanState, ShipState } from "./types";

// The draft's turn order (#111), on its own: who the turn passes to as seats
// pick, and when the draft is over.

const PLAY_ORDER = ["0", "1", "2"];

/** A table whose `picked` seats have taken command; the rest still choose. */
function table(picked: string[]): Pick<CaribbeanState, "ships"> {
  const ships: Record<string, ShipState> = {};
  for (const seat of PLAY_ORDER) {
    ships[seat] = (picked.includes(seat) ? { captain: { id: `c${seat}` }, shipClass: "Sloop" } : {}) as ShipState;
  }
  return { ships };
}

describe("hasPicked and everySeatPicked", () => {
  it("counts a seat as picked only with both a captain and a ship class", () => {
    const G = table(["1"]);
    G.ships["2"] = { captain: { id: "c2" } } as ShipState;
    expect(PLAY_ORDER.map((seat) => hasPicked(G, seat))).toEqual([false, true, false]);
    expect(hasPicked(G, "7")).toBe(false);
    expect(everySeatPicked(G)).toBe(false);
    expect(everySeatPicked(table(PLAY_ORDER))).toBe(true);
  });
});

describe("nextToPick", () => {
  it("passes the turn to the next seat still choosing, wrapping round the table", () => {
    expect(nextToPick(table(["0"]), PLAY_ORDER, 0)).toBe(1);
    expect(nextToPick(table(["0", "1"]), PLAY_ORDER, 0)).toBe(2);
    // Seat 2 picked out of turn: from seat 1 the turn skips it, back to seat 0
    expect(nextToPick(table(["1", "2"]), PLAY_ORDER, 1)).toBe(0);
  });

  it("once every seat has picked, passes to the last seat whoever picked last, so the draft ends there", () => {
    const all = table(PLAY_ORDER);
    expect(nextToPick(all, PLAY_ORDER, 0)).toBe(2);
    expect(nextToPick(all, PLAY_ORDER, 1)).toBe(2);
    expect(nextToPick(all, PLAY_ORDER, 2)).toBe(2);
  });
});

describe("draftOver", () => {
  it("is not over while any seat still chooses, even on the last seat's turn", () => {
    expect(draftOver(table(["0", "2"]), PLAY_ORDER, 2)).toBe(false);
  });

  it("is over only once every seat has picked and the turn has reached the last seat", () => {
    const all = table(PLAY_ORDER);
    expect(draftOver(all, PLAY_ORDER, 0)).toBe(false);
    expect(draftOver(all, PLAY_ORDER, 1)).toBe(false);
    expect(draftOver(all, PLAY_ORDER, 2)).toBe(true);
  });

  it("ends a solo draft on its one seat's pick", () => {
    expect(draftOver({ ships: { "0": { captain: { id: "c0" }, shipClass: "Flute" } as ShipState } }, ["0"], 0)).toBe(true);
  });
});
