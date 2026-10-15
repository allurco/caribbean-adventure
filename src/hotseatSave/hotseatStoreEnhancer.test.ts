import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { Caribbean, withGeneratedMap, withHotseatView } from "../game/Game";
import type { CaribbeanState } from "../game/Game";
import { generateMapFor } from "../game/mapRequest";
import { hotseatStoreEnhancer } from "./hotseatStoreEnhancer";
import type { MatchState } from "./hotseatSave";

const request = { mapSize: "small", mapSeed: 7 } as const;
const map = { ...request, ...generateMapFor(request) };
const game = withHotseatView(withGeneratedMap(Caribbean, map));

function match(start?: MatchState) {
  const states: MatchState[] = [];
  const client = Client<CaribbeanState>({ game, numPlayers: 1, enhancer: hotseatStoreEnhancer({ start, onState: (s) => states.push(s) }) });
  client.start();
  return { client, states };
}

describe("the hotseat store enhancer", () => {
  it("reports a new match only once it is played, so a match built and never shown (StrictMode) is not saved", () => {
    const { client, states } = match();
    expect(states).toEqual([]);
    client.moves.pickCaptain(0, "Sloop");
    expect(states.at(-1)!.ctx.phase).toBe("main");
  });

  it("starts a restored match in its saved state and reports that state at once", () => {
    const played = match();
    played.client.moves.pickCaptain(0, "Sloop");
    const saved = played.client.store.getState();
    const { client, states } = match(saved);
    expect(client.getState()!.ctx.phase).toBe("main");
    expect(states).toEqual([saved]);
  });
});
