import { describe, it, expect } from "vitest";
import { advanceRoute, startRoute, type RouteObservation, type RouteQueue } from "./routeQueue";
import { hex, NO_WRAP, createWrap, neighbors } from "../game/hex";
import type { Hex } from "../game/hex";

const route = [hex(1, 0), hex(2, 0), hex(3, 0)];

/** The board as the queue sees it, the ship at `position` with every neighbour open. */
function seen(position: Hex, over: Partial<RouteObservation> = {}): RouteObservation {
  return {
    player: "0",
    phase: "main",
    inCombat: false,
    gameOver: false,
    position,
    numMoves: 0,
    movesLeft: 3,
    openSteps: neighbors(position),
    atDockingHex: false,
    ...over,
  };
}

/** Sails `queue` on: send its next step, then see the ship arrive there with one more move used. */
function sendAndArrive(queue: RouteQueue, obs: RouteObservation) {
  const sent = advanceRoute(queue, obs, NO_WRAP);
  if (sent.kind !== "send") throw new Error(`expected a send, got ${sent.kind}`);
  return { sent, arrived: seen(sent.hex, { numMoves: obs.numMoves + 1, movesLeft: obs.movesLeft - 1 }) };
}

describe("route queue", () => {
  it("sends the first step at once", () => {
    const q = startRoute(route, "0");
    const a = advanceRoute(q, seen(hex(0, 0)), NO_WRAP);
    expect(a.kind).toBe("send");
    if (a.kind === "send") expect(a.hex).toEqual(hex(1, 0));
  });

  it("waits while the step it sent has not been applied", () => {
    const q = startRoute(route, "0");
    const a = advanceRoute(q, seen(hex(0, 0)), NO_WRAP);
    if (a.kind !== "send") throw new Error();
    const b = advanceRoute(a.queue, seen(hex(0, 0)), NO_WRAP);
    expect(b.kind).toBe("wait");
  });

  it("sends each step after the one before is applied, in order, then is done", () => {
    let q = startRoute(route, "0");
    let obs = seen(hex(0, 0));
    const sentHexes: Hex[] = [];
    for (let i = 0; i < 3; i++) {
      const { sent, arrived } = sendAndArrive(q, obs);
      sentHexes.push(sent.hex);
      q = sent.queue;
      obs = arrived;
    }
    expect(sentHexes).toEqual(route);
    const end = advanceRoute(q, obs, NO_WRAP);
    expect(end).toEqual({ kind: "done", reason: "arrived" });
  });

  it("drops the rest when the next step is no longer open (rejected)", () => {
    const q = startRoute(route, "0");
    const { sent, arrived } = sendAndArrive(q, seen(hex(0, 0)));
    const blocked = { ...arrived, openSteps: arrived.openSteps.filter((h) => !(h.q === 2 && h.r === 0)) };
    expect(advanceRoute(sent.queue, blocked, NO_WRAP)).toEqual({ kind: "done", reason: "rejected" });
  });

  it("drops the rest when the move was not applied but a move was used (moved elsewhere)", () => {
    const q = startRoute(route, "0");
    const a = advanceRoute(q, seen(hex(0, 0)), NO_WRAP);
    if (a.kind !== "send") throw new Error();
    expect(advanceRoute(a.queue, seen(hex(0, 1), { numMoves: 1 }), NO_WRAP)).toEqual({ kind: "done", reason: "interrupted" });
  });

  it("stops on arriving at a port's docking hex before the end", () => {
    const q = startRoute(route, "0");
    const { sent, arrived } = sendAndArrive(q, seen(hex(0, 0)));
    expect(advanceRoute(sent.queue, { ...arrived, atDockingHex: true }, NO_WRAP)).toEqual({ kind: "done", reason: "interrupted" });
  });

  it("is simply done when the docking hex is where it was going", () => {
    const q = startRoute([hex(1, 0)], "0");
    const { sent, arrived } = sendAndArrive(q, seen(hex(0, 0)));
    expect(advanceRoute(sent.queue, { ...arrived, atDockingHex: true }, NO_WRAP)).toEqual({ kind: "done", reason: "arrived" });
  });

  it("stops when combat starts, the phase or the player changes, or the game ends", () => {
    const q = startRoute(route, "0");
    const { sent, arrived } = sendAndArrive(q, seen(hex(0, 0)));
    for (const change of [{ inCombat: true }, { phase: "combat" }, { player: "1" }, { gameOver: true }]) {
      expect(advanceRoute(sent.queue, { ...arrived, ...change }, NO_WRAP)).toEqual({ kind: "done", reason: "interrupted" });
    }
  });

  it("stops when no moves are left", () => {
    const q = startRoute(route, "0");
    const { sent, arrived } = sendAndArrive(q, seen(hex(0, 0)));
    expect(advanceRoute(sent.queue, { ...arrived, movesLeft: 0 }, NO_WRAP)).toEqual({ kind: "done", reason: "interrupted" });
  });

  it("an empty route is done at once", () => {
    expect(advanceRoute(startRoute([], "0"), seen(hex(0, 0)), NO_WRAP)).toEqual({ kind: "done", reason: "arrived" });
  });

  it("knows an arrival across the seam by any copy of the hex", () => {
    const wrap = createWrap(8);
    const q = startRoute([hex(8, -4)], "0");
    const a = advanceRoute(q, seen(hex(7, -4), { openSteps: [hex(8, -4)] }), wrap);
    if (a.kind !== "send") throw new Error();
    const end = advanceRoute(a.queue, seen(hex(0, 0), { numMoves: 1 }), wrap);
    expect(end).toEqual({ kind: "done", reason: "arrived" });
  });
});
