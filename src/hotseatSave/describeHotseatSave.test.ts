import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { Caribbean, withGeneratedMap, withHotseatView } from "../game/Game";
import type { CaribbeanState } from "../game/Game";
import { generateMapFor } from "../game/mapRequest";
import { STARTER_SHIP_CLASSES } from "../game/types";
import { saveHotseat } from "./hotseatSave";
import { describeHotseatSave, savedAgo } from "./describeHotseatSave";

const request = { mapSize: "medium", mapSeed: 7 } as const;
const map = { ...request, ...generateMapFor(request) };
const MINUTE = 60_000;

function match(numPlayers: number) {
  const client = Client<CaribbeanState>({ game: withHotseatView(withGeneratedMap(Caribbean, map)), numPlayers });
  client.start();
  return client;
}

describe("the saved voyage's summary", () => {
  it("names the turn, the seats and their captains, the map and when it was saved", () => {
    const client = match(2);
    client.moves.pickCaptain(0, STARTER_SHIP_CLASSES[0]);
    client.moves.pickCaptain(1, STARTER_SHIP_CLASSES[0]);
    client.events.endTurn!();
    const { G } = client.getState()!;
    const save = saveHotseat(client.store.getState(), map, 0);
    expect(describeHotseatSave(save, 5 * MINUTE)).toEqual({
      turn: "Turn 4",
      seats: "2 captains",
      captains: [G.ships["0"].captain!.name, G.ships["1"].captain!.name],
      map: "Medium map",
      saved: "Saved 5 minutes ago",
    });
  });

  it("says when the captains are still being drafted, and a solo game", () => {
    const save = saveHotseat(match(1).store.getState(), map, 0);
    const summary = describeHotseatSave(save, 0);
    expect(summary.turn).toBe("Drafting captains");
    expect(summary.seats).toBe("Solo");
    expect(summary.captains).toEqual([]);
  });

  it("says how long ago, in the largest unit that fits", () => {
    expect(savedAgo(0, 30_000)).toBe("Saved just now");
    expect(savedAgo(0, MINUTE)).toBe("Saved 1 minute ago");
    expect(savedAgo(0, 59 * MINUTE)).toBe("Saved 59 minutes ago");
    expect(savedAgo(0, 60 * MINUTE)).toBe("Saved 1 hour ago");
    expect(savedAgo(0, 5 * 60 * MINUTE)).toBe("Saved 5 hours ago");
    expect(savedAgo(0, 24 * 60 * MINUTE)).toBe("Saved yesterday");
    expect(savedAgo(0, 3 * 24 * 60 * MINUTE)).toBe("Saved 3 days ago");
    // A clock set back: not "in the future"
    expect(savedAgo(MINUTE, 0)).toBe("Saved just now");
  });
});
