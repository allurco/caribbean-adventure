import { describe, it, expect } from "vitest";
import { captainPicked, helmChanged, helmOf, nextOpening, openingTurnView, turnEndedBannerShows } from "./captainPickTurn";
import { turnChangeView } from "./shipView";
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

describe("captainPicked: the seat choosing a new captain has picked (#286)", () => {
  const before = { player: "1", turn: 7, choosing: true };
  const after = { player: "1", turn: 7, choosing: false };

  it("once the seat that was choosing has a captain, within the same turn", () => {
    expect(captainPicked(before, after)).toBe(true);
  });

  it("not while the seat is still choosing, nor without a pick", () => {
    expect(captainPicked(before, before)).toBe(false);
    expect(captainPicked(after, after)).toBe(false);
    expect(captainPicked(null, after)).toBe(false);
  });

  it("not when the turn moved on instead", () => {
    expect(captainPicked(before, { ...after, turn: 8 })).toBe(false);
    expect(captainPicked(before, { ...after, player: "0" })).toBe(false);
  });
});

describe("helmChanged: whether the board's helm is out of date", () => {
  const helm = { player: "1", turn: 7, choosing: true };
  it("on the first look, and when the player, turn or choosing changes", () => {
    expect(helmChanged(null, helm)).toBe(true);
    expect(helmChanged(helm, { ...helm, player: "0" })).toBe(true);
    expect(helmChanged(helm, { ...helm, turn: 8 })).toBe(true);
    expect(helmChanged(helm, { ...helm, choosing: false })).toBe(true);
  });
  it("not for the same helm, as a new object", () => {
    expect(helmChanged(helm, { ...helm })).toBe(false);
  });
});

describe("nextOpening: when a turn opens (#216, #286)", () => {
  const none = { announced: null, newCaptain: null };
  const seat = (player: string, turn = 7, choosing = false) => ({ player, turn, choosing });

  it("nothing to do with nothing pending", () => {
    expect(nextOpening(none, seat("1"), at("idle"))).toEqual({ kind: "none" });
  });

  it("an announced turn opens at once for a seat with a ship", () => {
    expect(nextOpening({ ...none, announced: "1" }, seat("1"), at("nextTurn"))).toEqual({ kind: "open", player: "1", newCaptain: false });
  });

  it("an announced turn is dropped while its seat is still to pick a captain: the pick opens it", () => {
    expect(nextOpening({ ...none, announced: "1" }, seat("1", 7, true), at("nextTurn"))).toEqual({ kind: "drop", which: "announced" });
  });

  it("an announcement for a seat whose turn it no longer is is dropped", () => {
    expect(nextOpening({ ...none, announced: "0" }, seat("1"), at("nextTurn"))).toEqual({ kind: "drop", which: "announced" });
  });

  it("a new captain's turn opens once the hand-off has nothing left to announce", () => {
    const p = { ...none, newCaptain: { player: "1", turn: 7 } };
    const open = { kind: "open", player: "1", newCaptain: true };
    expect(nextOpening(p, seat("1"), null)).toEqual(open);
    expect(nextOpening(p, seat("1"), at("nextTurn"))).toEqual(open);
    // Timed out (12 s) straight to idle without announcing: the turn still opens
    expect(nextOpening(p, seat("1"), at("idle"))).toEqual(open);
  });

  it("a pick before the hand-off announces waits for it, then opens once, as a new captain's", () => {
    const p = { ...none, newCaptain: { player: "1", turn: 7 } };
    expect(nextOpening(p, seat("1"), at("sailing"))).toEqual({ kind: "none" });
    expect(nextOpening(p, seat("1"), at("turnEnded"))).toEqual({ kind: "none" });
    expect(nextOpening(p, seat("1"), at("npcs"))).toEqual({ kind: "none" });
    // The pick committed during npcs; the hand-off reaches nextTurn and announces too
    expect(nextOpening({ ...p, announced: "1" }, seat("1"), at("nextTurn"))).toEqual({ kind: "open", player: "1", newCaptain: true });
  });

  it("a new captain's pending turn is dropped once the turn has moved on", () => {
    const p = { ...none, newCaptain: { player: "1", turn: 7 } };
    expect(nextOpening(p, seat("1", 8), at("sailing"))).toEqual({ kind: "drop", which: "newCaptain" });
    expect(nextOpening(p, seat("0", 8), null)).toEqual({ kind: "drop", which: "newCaptain" });
  });

  it("dropping a stale new captain's turn keeps the announcement of the turn that came after it", () => {
    const p = { announced: "0", newCaptain: { player: "1", turn: 7 } };
    expect(nextOpening(p, seat("0", 9), at("nextTurn"))).toEqual({ kind: "drop", which: "newCaptain" });
    expect(nextOpening({ ...p, newCaptain: null }, seat("0", 9), at("nextTurn"))).toEqual({ kind: "open", player: "0", newCaptain: false });
  });
});

describe("openingTurnView: where the camera goes as a turn opens", () => {
  const fleet = { "0": { position: { q: 0, r: 0, s: 0 } }, "1": { position: { q: 2, r: 0, s: -2 } } };
  it("a plain turn: the new player's ship in hotseat, nowhere for a networked client", () => {
    expect(openingTurnView({ ships: fleet, currentPlayer: "1", playerID: null }, false)).toEqual(turnChangeView({ ships: fleet, currentPlayer: "1", playerID: null }));
    expect(openingTurnView({ ships: fleet, currentPlayer: "1", playerID: "1" }, false)).toBeNull();
  });
  it("a new captain's turn: the seat that picked flies to its new ship, networked too", () => {
    expect(openingTurnView({ ships: fleet, currentPlayer: "1", playerID: "1" }, true)).toEqual(turnChangeView({ ships: fleet, currentPlayer: "1", playerID: null }));
    expect(openingTurnView({ ships: fleet, currentPlayer: "1", playerID: "0" }, true)).toBeNull();
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
