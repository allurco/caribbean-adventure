import { describe, it, expect } from "vitest";
import { crewFight } from "./boarding";

/** A seeded d6, so a sweep over seeds replays the same fights. */
function seededD6(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return 1 + Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 6);
  };
}

/** Dice that come up in this order, then misses (a test that runs past them never ends, so each gives enough). */
function diceOf(...faces: number[]): () => number {
  let i = 0;
  return () => faces[i++] ?? 1;
}

describe("the crew fight (#350)", () => {
  it("rolls one die per crew on each side at once, each 5 or 6 killing one enemy crew", () => {
    // Boarder 3 crew: 6, 5, 1 (two kills); defender 4 crew: 6, 1, 1, 1 (one kill)
    const fight = crewFight(3, 4, diceOf(6, 5, 1, 6, 1, 1, 1, 6, 6, 1, 1));
    expect(fight.exchanges[0]).toEqual({ boarderDice: [6, 5, 1], defenderDice: [6, 1, 1, 1], boarderCrew: 2, defenderCrew: 2 });
  });

  it("repeats until a side is down to 1 crew, which strikes its colours", () => {
    // Exchange 1: boarder kills 2 (4 → 2), defender kills none. Exchange 2: boarder kills 1 (2 → 1)
    const fight = crewFight(3, 4, diceOf(6, 6, 1, 1, 1, 1, 1, 5, 1, 1, 1));
    expect(fight.exchanges.map((e) => [e.boarderCrew, e.defenderCrew])).toEqual([[3, 2], [3, 1]]);
    expect(fight.winner).toBe("boarder");
    expect(fight).toMatchObject({ boarderCrew: 3, defenderCrew: 1 });
  });

  it("is won by the defender when the boarder is the one down to 1", () => {
    const fight = crewFight(2, 3, diceOf(1, 1, 6, 1, 1));
    expect(fight).toMatchObject({ winner: "defender", boarderCrew: 1, defenderCrew: 3 });
  });

  it("is won by the boarder when both reach 1 together", () => {
    const fight = crewFight(2, 2, diceOf(6, 1, 6, 1));
    expect(fight.exchanges).toEqual([{ boarderDice: [6, 1], defenderDice: [6, 1], boarderCrew: 1, defenderCrew: 1 }]);
    expect(fight.winner).toBe("boarder");
  });

  it("never kills a side below 1 crew, however many hits it takes", () => {
    const fight = crewFight(5, 2, diceOf(6, 6, 6, 6, 6, 1, 1));
    expect(fight).toMatchObject({ winner: "boarder", boarderCrew: 5, defenderCrew: 1 });
  });

  it("is over at once, no dice rolled, against a ship already down to 1 crew", () => {
    const fight = crewFight(3, 1, () => {
      throw new Error("no die should be rolled");
    });
    expect(fight).toEqual({ exchanges: [], winner: "boarder", boarderCrew: 3, defenderCrew: 1 });
  });

  it("over many seeds: always ends with a side at 1 crew, never below, the boarder winning every tie at 1", () => {
    let ties = 0;
    let boarderWins = 0;
    let defenderWins = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const boarder = 2 + (seed % 7);
      const defender = 1 + ((seed * 7) % 9);
      const fight = crewFight(boarder, defender, seededD6(seed));
      expect(Math.min(fight.boarderCrew, fight.defenderCrew)).toBe(1);
      for (const e of fight.exchanges) {
        expect(e.boarderCrew).toBeGreaterThanOrEqual(1);
        expect(e.defenderCrew).toBeGreaterThanOrEqual(1);
      }
      // Every exchange but the last leaves both sides above 1
      for (const e of fight.exchanges.slice(0, -1)) expect(Math.min(e.boarderCrew, e.defenderCrew)).toBeGreaterThan(1);
      // Each exchange rolls one die per crew the side had going in
      let crews = [boarder, defender];
      for (const e of fight.exchanges) {
        expect([e.boarderDice.length, e.defenderDice.length]).toEqual(crews);
        crews = [e.boarderCrew, e.defenderCrew];
      }
      if (fight.boarderCrew === 1 && fight.defenderCrew === 1) {
        ties++;
        expect(fight.winner).toBe("boarder");
      } else {
        expect(fight.winner).toBe(fight.defenderCrew === 1 ? "boarder" : "defender");
      }
      if (fight.winner === "boarder") boarderWins++;
      else defenderWins++;
    }
    expect(ties).toBeGreaterThan(0);
    expect(boarderWins).toBeGreaterThan(0);
    expect(defenderWins).toBeGreaterThan(0);
  });
});
