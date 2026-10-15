import { describe, expect, it } from "vitest";
import { harbourVoyages, type VoyageView } from "./voyageList";

const ROOM_A = "00000000-0000-4000-9000-00000000000a";
const ROOM_B = "00000000-0000-4000-9000-00000000000b";
const ROOM_C = "00000000-0000-4000-9000-00000000000c";
const ROOM_D = "00000000-0000-4000-9000-00000000000d";
const ROOM_E = "00000000-0000-4000-9000-00000000000e";
const MATCH = "00000000-0000-4000-9000-0000000000ff";

const ANNE = { index: 0, displayName: "Anne Bonny" };
const JACK = { index: 1, displayName: "Calico Jack" };
const MARY = { index: 2, displayName: "Mary Read" };

const voyage = (over: Partial<VoyageView>): VoyageView => ({
  roomId: ROOM_A,
  matchId: null,
  status: "open",
  seatCount: 2,
  mapSize: "small",
  seats: [ANNE],
  yourSeat: 0,
  currentSeat: null,
  turn: null,
  yourTurn: false,
  updatedAt: "2026-10-15T12:00:00.000Z",
  ...over,
});

const underWay = (over: Partial<VoyageView>) => voyage({ matchId: MATCH, status: "started", seats: [ANNE, JACK], turn: 1, ...over });

describe("harbourVoyages", () => {
  it("has nothing to show with no voyages", () => {
    expect(harbourVoyages([])).toEqual({ lead: null, others: [] });
  });

  it("leads with the match waiting on the player: its captains, round, seats and map, and Take your turn", () => {
    const { lead, others } = harbourVoyages([underWay({ roomId: ROOM_B, currentSeat: 0, yourTurn: true, turn: 5 })]);
    expect(lead).toEqual({
      roomId: ROOM_B,
      name: "Anne Bonny and Calico Jack",
      line: "Round 3, 2 captains, small map.",
      link: { href: `/?view=match&id=${MATCH}`, label: "Take your turn" },
    });
    expect(others).toEqual([]);
  });

  it("leads with the most recent of several turns waiting, and lists the rest first among the others", () => {
    const { lead, others } = harbourVoyages([
      underWay({ roomId: ROOM_A, currentSeat: 1, yourSeat: 0 }),
      underWay({ roomId: ROOM_B, currentSeat: 0, yourTurn: true }),
      underWay({ roomId: ROOM_C, currentSeat: 0, yourTurn: true }),
    ]);
    expect(lead?.roomId).toBe(ROOM_B);
    expect(others.map((o) => [o.roomId, o.line, o.yourTurn, o.link.label])).toEqual([
      [ROOM_C, "Round 1, 2 captains, small map. Your turn.", true, "Open"],
      [ROOM_A, "Round 1, 2 captains, small map. Waiting on Calico Jack.", false, "Open"],
    ]);
  });

  it("lists the other voyages: under way, then waiting in the lobby, then finished, each with its way in", () => {
    const { lead, others } = harbourVoyages([
      voyage({ roomId: ROOM_A, status: "finished", matchId: MATCH, seats: [ANNE, JACK] }),
      voyage({ roomId: ROOM_B, status: "open", seatCount: 3 }),
      voyage({ roomId: ROOM_C, status: "starting", seats: [ANNE, JACK] }),
      underWay({ roomId: ROOM_D, currentSeat: 1, turn: 4 }),
    ]);
    expect(lead).toBeNull();
    expect(others).toEqual([
      {
        roomId: ROOM_D,
        name: "Anne Bonny and Calico Jack",
        line: "Round 2, 2 captains, small map. Waiting on Calico Jack.",
        yourTurn: false,
        link: { href: `/?view=match&id=${MATCH}`, label: "Open" },
      },
      {
        roomId: ROOM_B,
        name: "Anne Bonny",
        line: "In the lobby: 1 of 3 captains aboard, small map.",
        yourTurn: false,
        link: { href: `/?view=room&id=${ROOM_B}`, label: "Lobby" },
      },
      {
        roomId: ROOM_C,
        name: "Anne Bonny and Calico Jack",
        line: "The match is being started, small map.",
        yourTurn: false,
        link: { href: `/?view=room&id=${ROOM_C}`, label: "Lobby" },
      },
      {
        roomId: ROOM_A,
        name: "Anne Bonny and Calico Jack",
        line: "Finished, 2 captains, small map.",
        yourTurn: false,
        link: { href: `/?view=match&id=${MATCH}`, label: "View" },
      },
    ]);
  });

  it("names three or more captains in a list, and one whose profile is gone", () => {
    const { others } = harbourVoyages([
      underWay({ roomId: ROOM_A, seatCount: 3, seats: [ANNE, { index: 1, displayName: null }, MARY], currentSeat: 1, turn: 7 }),
    ]);
    expect(others[0]).toMatchObject({
      name: "Anne Bonny, a captain and Mary Read",
      line: "Round 3, 3 captains, small map. Waiting on a captain.",
    });
  });

  it("leaves out what it does not know: the round before the server says, and whose turn", () => {
    const { others } = harbourVoyages([underWay({ roomId: ROOM_E, mapSize: "large", turn: null, currentSeat: null })]);
    expect(others[0].line).toBe("2 captains, large map.");
  });
});
