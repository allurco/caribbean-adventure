import { describe, it, expect } from "vitest";
import { boardingIntro, boardingOutcomeLines, boardRefusal, crewExchangeLine } from "./boardingText";
import type { BoardingRecord } from "../game/types";

const name = (id: string) => (id === "foe" ? "The merchant" : `Player ${Number(id) + 1}`);
const goods = (extra: Partial<BoardingRecord["taken"]> = {}) => ({ Wood: 0, Sugar: 0, Rum: 0, Spice: 0, ...extra });

const record = (extra: Partial<BoardingRecord> = {}): BoardingRecord => ({
  boarderId: "0",
  boardedId: "1",
  exchanges: [],
  winnerId: "0",
  gold: 0,
  taken: goods(),
  floated: null,
  ...extra,
});

describe("boardRefusal: why Board is off at the choice (#350)", () => {
  it("is nothing for a boarder alongside with 2 crew or more", () => {
    expect(boardRefusal(1, 2)).toBeNull();
  });

  it("names the distance first, then the crew", () => {
    expect(boardRefusal(2, 5)).toBe("Boarding requires adjacent ships");
    expect(boardRefusal(1, 1)).toBe("Too few crew to board: it takes 2");
  });
});

describe("boardingIntro: the boarding step's line", () => {
  it("names who boards whom, and how the crew fight goes", () => {
    expect(boardingIntro("Player 1", "the merchant")).toBe(
      "Player 1 boards the merchant! Each hand rolls a die, and each 5 or 6 kills one of the other crew. The first side down to 1 strikes its colours."
    );
  });
});

describe("crewExchangeLine: one exchange of the crew fight in words", () => {
  it("each side's dice, its kills, and the crews after", () => {
    const exchange = { boarderDice: [6, 5, 1], defenderDice: [6, 1, 1, 1], boarderCrew: 2, defenderCrew: 2 };
    expect(crewExchangeLine(exchange, 0, "Player 1", "Player 2")).toBe(
      "Exchange 1: Player 1 rolls 6 5 1, 2 kills; Player 2 rolls 6 1 1 1, 1 kill. Crew 2 to 2"
    );
  });

  it("says no kills when none fell", () => {
    const exchange = { boarderDice: [1, 2], defenderDice: [3, 4], boarderCrew: 2, defenderCrew: 2 };
    expect(crewExchangeLine(exchange, 2, "Player 1", "The merchant")).toBe(
      "Exchange 3: Player 1 rolls 1 2, no kills; The merchant rolls 3 4, no kills. Crew 2 to 2"
    );
  });
});

describe("boardingOutcomeLines: how the boarding ended", () => {
  it("the loser strikes, and the winner's plunder: gold and the goods taken", () => {
    expect(boardingOutcomeLines(record({ gold: 30, taken: goods({ Sugar: 2 }) }), name)).toEqual([
      "Player 2 strikes its colours",
      "Player 1 takes 30 gold and 2 Sugar",
    ]);
  });

  it("the cargo that did not fit floats free", () => {
    expect(boardingOutcomeLines(record({ taken: goods({ Wood: 1 }), floated: goods({ Sugar: 1, Rum: 2 }) }), name)).toEqual([
      "Player 2 strikes its colours",
      "Player 1 takes 1 Wood",
      "1 Sugar, 2 Rum float free: no room in the hold",
    ]);
  });

  it("a boarder beaten off strikes instead; a loser with nothing aboard gives nothing", () => {
    expect(boardingOutcomeLines(record({ boarderId: "0", boardedId: "foe", winnerId: "foe" }), name)).toEqual([
      "Player 1 strikes its colours",
      "The merchant takes nothing: no gold or cargo aboard",
    ]);
  });
});
