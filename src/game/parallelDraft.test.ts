/**
 * The draft with a seat per client (#111): every seat picks its own captain
 * at once, nobody waiting for the seats before them, and the match sails
 * once the last has picked, seat 0 first. Played through boardgame.io's local
 * transport, which checks who may move as a server would. Hotseat, one
 * screen passing the pick from seat to seat, is in `seatCount.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { Local } from "boardgame.io/multiplayer";
import { Caribbean, withGeneratedMap } from "./Game";
import type { CaribbeanState } from "./Game";
import { generateMapFor } from "./mapRequest";

const request = { mapSize: "small", mapSeed: 7 } as const;
const map = { ...request, ...generateMapFor(request) };

/** Every seat of a match on one page, each its own client. */
function seatsOnOnePage(seats: number) {
  const game = withGeneratedMap(Caribbean, map);
  const multiplayer = Local();
  return Array.from({ length: seats }, (_, i) => {
    const client = Client<CaribbeanState>({ game, numPlayers: seats, playerID: String(i), multiplayer });
    client.start();
    return client;
  });
}

const PICK_ORDERS: Record<number, number[][]> = {
  2: [[1, 0], [0, 1]],
  3: [[2, 1, 0], [1, 2, 0], [2, 0, 1], [0, 2, 1]],
  4: [[3, 2, 1, 0], [1, 3, 0, 2], [0, 1, 2, 3], [2, 0, 3, 1]],
};

describe("the draft, a seat per client", () => {
  for (const [seats, orders] of Object.entries(PICK_ORDERS)) {
    for (const order of orders) {
      it(`with ${seats} seats, picks in the order ${order.join(", ")} and then sails, seat 0 first`, () => {
        const clients = seatsOnOnePage(Number(seats));
        order.forEach((seat, n) => {
          const before = clients[seat].getState()!;
          expect(before.ctx.phase, `before pick ${n}`).toBe("draft");
          const hand = before.G.draftHands[String(seat)];
          clients[seat].moves.pickCaptain(1, "Flute");
          const after = clients[seat].getState()!.G.ships[String(seat)];
          expect(after.captain, `seat ${seat}`).toEqual(hand[1]);
          expect(after.shipClass).toBe("Flute");
        });
        const { ctx, G } = clients[0].getState()!;
        expect(ctx.phase).toBe("main");
        expect(ctx.currentPlayer).toBe("0");
        expect(Object.values(G.ships).every((s) => s.captain)).toBe(true);
        clients.forEach((c) => c.stop());
      });
    }
  }

  it("lets a seat pick only once, and only from its own hand", () => {
    const clients = seatsOnOnePage(3);
    const stateID = () => clients[0].getState()!._stateID;
    const start = stateID();
    clients[2].moves.pickCaptain(2, "Sloop");
    clients[2].moves.pickCaptain(0, "Galleon");
    expect(stateID()).toBe(start);

    clients[2].moves.pickCaptain(0, "Sloop");
    expect(stateID()).toBe(start + 1);
    const captain = clients[2].getState()!.G.ships["2"].captain;
    clients[2].moves.pickCaptain(1, "Flute");
    expect(stateID()).toBe(start + 1);
    expect(clients[2].getState()!.G.ships["2"].captain).toEqual(captain);
    expect(clients[2].getState()!.G.ships["2"].shipClass).toBe("Sloop");
    clients.forEach((c) => c.stop());
  });

  it("keeps End Turn shut until the seat whose turn it is has picked", () => {
    const clients = seatsOnOnePage(2);
    clients[1].moves.pickCaptain(0, "Sloop");
    clients[0].events.endTurn!();
    expect(clients[0].getState()!.ctx).toMatchObject({ phase: "draft", currentPlayer: "0" });
    clients.forEach((c) => c.stop());
  });
});
