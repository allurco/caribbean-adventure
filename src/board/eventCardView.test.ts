import { describe, it, expect } from "vitest";
import type { EventLogEntry, Region } from "../game/types";
import { eventCardShows, eventCardView, eventLogLength, eventLogRows, freshEventCard, lastEventId } from "./eventCardView";

const regions: Region[] = [
  { id: 0, nation: "England", name: "the Windward Isles", neighbours: [1] },
  { id: 1, nation: "Spain", name: "the Spanish Main", neighbours: [0] },
];

const calm = (id: number): EventLogEntry => ({ id, seat: "0", turn: id, kind: "calmSeas" });
const convoy = (id: number, bound: string[] = ["Port Royal"]): EventLogEntry => ({
  id, seat: "1", turn: id, kind: "merchantConvoy", region: 1, port: "Havana", merchants: bound.length, bound,
});

describe("the event card's face (#246)", () => {
  it("a convoy of one: its name, its region, and where the merchant sails", () => {
    expect(eventCardView(convoy(3), regions)).toEqual({
      id: 3,
      title: "Merchant convoy",
      region: "the Spanish Main",
      effect: "A merchant sails from Havana, bound for Port Royal.",
      art: "merchantConvoy",
      nation: null,
    });
  });

  it("a convoy of two names both ports they make for", () => {
    expect(eventCardView(convoy(3, ["Port Royal", "Tortuga"]), regions).effect).toBe(
      "2 merchants sail from Havana, bound for Port Royal and Tortuga."
    );
    expect(eventCardView(convoy(3, ["Port Royal", "Port Royal"]), regions).effect).toBe(
      "2 merchants sail from Havana, bound for Port Royal."
    );
  });

  it("calm seas: no region, a quiet line", () => {
    expect(eventCardView(calm(2), regions)).toEqual({
      id: 2,
      title: "Calm seas",
      region: null,
      effect: "The sea lies quiet.",
      art: "calmSeas",
      nation: null,
    });
  });

  it("a region the map does not know reads as none", () => {
    expect(eventCardView(convoy(3), undefined).region).toBeNull();
  });
});

describe("which card to show (#246)", () => {
  it("the newest card drawn since the board last looked, unless it is Calm seas", () => {
    expect(freshEventCard(1, [calm(1), convoy(2)])?.id).toBe(2);
    expect(freshEventCard(2, [calm(1), convoy(2), calm(3)])).toBeNull();
    expect(freshEventCard(2, [calm(1), convoy(2)])).toBeNull();
  });

  it("of several drawn at once, the newest that is not calm", () => {
    expect(freshEventCard(0, [convoy(1), convoy(2), calm(3)])?.id).toBe(2);
  });

  it("the last event's id, or 0 with none: what the board has seen on load", () => {
    expect(lastEventId(undefined)).toBe(0);
    expect(lastEventId([calm(1), convoy(2)])).toBe(2);
  });
});

describe("the event log's rows (#246)", () => {
  it("the last few events, newest first", () => {
    const log = [calm(1), convoy(2), calm(3), calm(4), convoy(5)];
    expect(eventLogRows(log, regions, 3).map((row) => row.id)).toEqual([5, 4, 3]);
    expect(eventLogRows(undefined, regions, 3)).toEqual([]);
  });
});

describe("when the card may show (#246)", () => {
  const idle = { phase: "idle" as const, from: "0", to: "1", startedAt: 0, phaseStartedAt: 0, reducedMotion: false };
  it("once the turn's hand-off has come to rest, or before any", () => {
    expect(eventCardShows({ handoff: idle, turnChangeShowing: false, gameOver: false, captainTurnPending: false })).toBe(true);
    expect(eventCardShows({ handoff: null, turnChangeShowing: false, gameOver: false, captainTurnPending: false })).toBe(true);
  });
  it("not while the hand-off plays, the turn change shows, or the game is over", () => {
    expect(eventCardShows({ handoff: { ...idle, phase: "turnEnded" }, turnChangeShowing: false, gameOver: false, captainTurnPending: false })).toBe(false);
    expect(eventCardShows({ handoff: idle, turnChangeShowing: true, gameOver: false, captainTurnPending: false })).toBe(false);
    expect(eventCardShows({ handoff: idle, turnChangeShowing: false, gameOver: true, captainTurnPending: false })).toBe(false);
  });
  it("not while a new captain's turn is pending, though the hand-off has come to rest (#372; the render-by-render walk is in captainPickTurn.test.ts)", () => {
    expect(eventCardShows({ handoff: idle, turnChangeShowing: false, gameOver: false, captainTurnPending: true })).toBe(false);
  });
});

describe("how many events the log lists (#246)", () => {
  it("four on a desktop; none on a phone held sideways, where the captain card leaves no room under the glory board", () => {
    expect(eventLogLength("desktop")).toBe(4);
    expect(eventLogLength("compact")).toBe(0);
  });
});

describe("whose turn a log row came on (#246)", () => {
  it("names the captain whose turn ended, so two convoys in a row read apart", () => {
    const rows = eventLogRows([convoy(1), convoy(2)], regions, 4, (seat) => `Captain ${seat}`);
    expect(rows.map((row) => row.after)).toEqual(["Captain 1", "Captain 1"]);
    expect(eventLogRows([{ ...convoy(1), seat: "0" }], regions, 4).map((row) => row.after)).toEqual([null]);
  });
});
