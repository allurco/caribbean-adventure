import { describe, it, expect } from "vitest";
import { captainPicked, helmOf, turnEndedBannerShows, turnOpensOnArrival } from "./captainPickTurn";
import { startHandoff, type Handoff, type HandoffPhase } from "./turnHandoff";

const at = (phase: HandoffPhase, from = "0", to = "1"): Handoff => ({ ...startHandoff(from, to, 0, false), phase });
const ships = { "0": { position: { q: 0, r: 0, s: 0 } } };
const lost = { "1": { cause: "sunk" as const, score: 3, stashedGold: 0 } };

describe("turnEndedBannerShows: the outgoing captain's 'turn ends' beat (#216, #286)", () => {
  it("shows through the beat while the outgoing ship is on the board", () => {
    expect(turnEndedBannerShows(at("turnEnded"), ships, false)).toBe(true);
  });

  it("never over the captain screen: the incoming seat is picking a new captain", () => {
    expect(turnEndedBannerShows(at("turnEnded"), ships, true)).toBe(false);
  });

  it("not outside the beat, with no hand-off, or once the outgoing ship is gone", () => {
    expect(turnEndedBannerShows(at("sailing"), ships, false)).toBe(false);
    expect(turnEndedBannerShows(at("npcs"), ships, false)).toBe(false);
    expect(turnEndedBannerShows(null, ships, false)).toBe(false);
    expect(turnEndedBannerShows(at("turnEnded", "2"), ships, false)).toBe(false);
  });
});

describe("turnOpensOnArrival: whether the turn opens as the hand-off reaches it", () => {
  it("opens for a seat with a ship", () => {
    expect(turnOpensOnArrival({ lostShips: lost }, "0")).toBe(true);
    expect(turnOpensOnArrival({}, "0")).toBe(true);
  });

  it("waits for the pick when the seat is still to choose a new captain (#286)", () => {
    expect(turnOpensOnArrival({ lostShips: lost }, "1")).toBe(false);
  });

  it("never opens for a seat out of the game: it has no ship to show", () => {
    expect(turnOpensOnArrival({ lostShips: { "1": { ...lost["1"], eliminated: true } } }, "1")).toBe(false);
  });
});

describe("captainPicked: the new captain's turn opens after the pick (#286)", () => {
  const before = { player: "1", turn: 7, choosing: true };
  const after = { player: "1", turn: 7, choosing: false };

  it("opens now once the seat that was choosing has picked, the hand-off done", () => {
    expect(captainPicked(before, after, null)).toBe("opensNow");
    expect(captainPicked(before, after, at("idle"))).toBe("opensNow");
    expect(captainPicked(before, after, at("nextTurn"))).toBe("opensNow");
  });

  it("leaves it to the hand-off when the pick lands before the turn is announced", () => {
    expect(captainPicked(before, after, at("sailing"))).toBe("atHandoff");
    expect(captainPicked(before, after, at("turnEnded"))).toBe("atHandoff");
    expect(captainPicked(before, after, at("npcs"))).toBe("atHandoff");
  });

  it("nothing while the seat is still choosing, nor without a pick", () => {
    expect(captainPicked(before, before, null)).toBe("none");
    expect(captainPicked(after, after, null)).toBe("none");
    expect(captainPicked(null, after, null)).toBe("none");
  });

  it("nothing when the turn moved on instead", () => {
    expect(captainPicked(before, { ...after, turn: 8 }, null)).toBe("none");
    expect(captainPicked(before, { ...after, player: "0" }, null)).toBe("none");
  });
});

describe("helmOf: the seat at the helm", () => {
  it("is choosing in the main phase while awaiting a new captain", () => {
    expect(helmOf({ lostShips: lost }, "main", "1", 4)).toEqual({ player: "1", turn: 4, choosing: true });
    expect(helmOf({ lostShips: lost }, "main", "0", 4)).toEqual({ player: "0", turn: 4, choosing: false });
  });

  it("not in the draft or a fight, nor once out of the game", () => {
    expect(helmOf({ lostShips: lost }, "draft", "1", 1).choosing).toBe(false);
    expect(helmOf({ lostShips: lost }, "combat", "1", 4).choosing).toBe(false);
    expect(helmOf({ lostShips: { "1": { ...lost["1"], eliminated: true } } }, "main", "1", 4).choosing).toBe(false);
  });
});
