/**
 * The seat count comes from the match (#278): `ctx.numPlayers`, 1 to 4. A
 * local game is solo by default, one seat against the NPCs; each seat
 * drafts only its own captain.
 */
import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { Caribbean, withGeneratedMap, withHotseatView, withSetupData } from "./Game";
import type { CaribbeanState } from "./Game";
import { generateMapFor } from "./mapRequest";
import { DEFAULT_SEATS, MAX_SEATS, MIN_SEATS, isValidSeatCount } from "./seats";
import { STARTER_SHIP_CLASSES } from "./types";

const request = { mapSize: "small", mapSeed: 7 } as const;
const map = { ...request, ...generateMapFor(request) };

function match(numPlayers: number) {
  const client = Client<CaribbeanState>({ game: withHotseatView(withGeneratedMap(Caribbean, map)), numPlayers });
  client.start();
  return client;
}

const seatIds = (n: number) => Array.from({ length: n }, (_, i) => String(i));

describe("the seat count", () => {
  it("is 1 to 4, solo by default", () => {
    expect([MIN_SEATS, MAX_SEATS, DEFAULT_SEATS]).toEqual([1, 4, 1]);
    expect([0, 1, 2, 3, 4, 5, 1.5, NaN].map(isValidSeatCount)).toEqual([false, true, true, true, true, false, false, false]);
  });

  it("is what the game declares to a lobby or server", () => {
    expect([Caribbean.minPlayers, Caribbean.maxPlayers]).toEqual([1, 4]);
  });

  for (let seats = 1; seats <= 4; seats++) {
    describe(`with ${seats} seat${seats > 1 ? "s" : ""}`, () => {
      it("sets up one ship and one two-captain hand per seat, from the match", () => {
        const { G } = match(seats).getState()!;
        expect(Object.keys(G.ships)).toEqual(seatIds(seats));
        expect(Object.keys(G.draftHands)).toEqual(seatIds(seats));
        for (const hand of Object.values(G.draftHands)) expect(hand).toHaveLength(2);
      });

      it("sets up the same seats when the map is generated in setup", () => {
        const client = Client<CaribbeanState>({ game: withHotseatView(withSetupData(Caribbean, request)), numPlayers: seats });
        client.start();
        expect(Object.keys(client.getState()!.G.ships)).toEqual(seatIds(seats));
      });

      it("drafts one captain per seat, each its own, then plays turns in seat order", () => {
        const client = match(seats);
        for (let i = 0; i < seats; i++) {
          expect(client.getState()!.ctx.phase).toBe("draft");
          expect(client.getState()!.ctx.currentPlayer).toBe(String(i));
          client.moves.pickCaptain(0, STARTER_SHIP_CLASSES[0]);
        }
        let { G, ctx } = client.getState()!;
        expect(ctx.phase).toBe("main");
        for (const id of seatIds(seats)) expect(G.ships[id].captain).toBeDefined();

        // A few rounds of turns: each ends, the NPCs move, the next seat (the same one, solo) sails.
        const order: string[] = [];
        for (let t = 0; t < seats * 3; t++) {
          order.push(client.getState()!.ctx.currentPlayer);
          client.events.endTurn!();
        }
        ({ G, ctx } = client.getState()!);
        expect(order).toEqual(Array.from({ length: seats * 3 }, (_, t) => String(t % seats)));
        expect(ctx.phase).toBe("main");
        expect(ctx.gameover).toBeUndefined();
        expect(Object.keys(G.ships)).toEqual(seatIds(seats));
      });
    });
  }

  it("solo: one pick and the board is yours, turn after turn", () => {
    const client = match(1);
    client.moves.pickCaptain(1, STARTER_SHIP_CLASSES[0]);
    const before = client.getState()!.ctx.turn;
    client.events.endTurn!();
    client.events.endTurn!();
    const { ctx } = client.getState()!;
    expect(ctx.currentPlayer).toBe("0");
    expect(ctx.turn).toBe(before + 2);
  });

  it("refuses a match of more seats than the game holds", () => {
    expect(() => match(5)).toThrow(/1 to 4 seats/);
  });
});
