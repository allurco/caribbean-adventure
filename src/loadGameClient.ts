import { Client } from "boardgame.io/react";
import { Caribbean, withGeneratedMap, withHotseatView } from "./game/Game";
import { withSeatedCombat } from "./game/seatedCombat";
import { DEFAULT_SEATS } from "./game/seats";
import type { CaribbeanSetupData } from "./game/Game";
import { resolveMapRequest } from "./game/mapRequest";
import { CaribbeanBoard } from "./board/Board";
import { generateMapOffThread } from "./mapWorker/generateMapOffThread";
import { createMapWorkerRunner } from "./mapWorker/createMapWorkerRunner";

/**
 * The local hotseat client, once its map is ready (#124). boardgame.io's
 * `setup()` is synchronous, so the map is generated first, in a worker (on
 * the main thread where there is none), and the client's game starts on it.
 * `setupData` is the dev URL pin (#74): its size and seed, else random ones;
 * `debugPanel: false` hides boardgame.io's debug panel (devUrlParams.ts).
 * `seats` is the match's seat count (#278): solo by default, more for a dev
 * hotseat game (`?players=`, `seatCount`).
 */
export async function loadGameClient(setupData: CaribbeanSetupData | undefined, debugPanel = true, seats = DEFAULT_SEATS) {
  const map = await generateMap(setupData);
  // One screen shared by every seat sees the whole table, not a spectator's view (#109).
  return Client({
    game: withHotseatView(withGeneratedMap(Caribbean, map)),
    board: CaribbeanBoard,
    numPlayers: seats,
    ...(debugPanel ? {} : { debug: false }),
  });
}

/**
 * Every seat of one match on one page (dev `?seats=1`, #110): the client is
 * rendered once per seat with its `playerID`, and boardgame.io's local
 * transport keeps one match for them all, each seat getting only its own
 * view (`playerView`, #109), as a networked seat would, and pressing only
 * its own combat steps (`withSeatedCombat`, as online). `debugPanel` comes
 * from `showsDebugPanel`, which is false for `?seats=1`; `seats` from `seatCount`.
 */
export async function loadSeatClient(setupData: CaribbeanSetupData | undefined, debugPanel: boolean, seats = DEFAULT_SEATS) {
  // Its own chunk: the multiplayer module brings the socket.io client, which the hotseat game never needs.
  const [map, { Local }] = await Promise.all([generateMap(setupData), import("boardgame.io/multiplayer")]);
  return Client({
    game: withGeneratedMap(withSeatedCombat(Caribbean), map),
    board: CaribbeanBoard,
    numPlayers: seats,
    multiplayer: Local(),
    ...(debugPanel ? {} : { debug: false }),
  });
}

function generateMap(setupData: CaribbeanSetupData | undefined) {
  // Seed picking (ADR 0007): with no pinned size or seed, this is where a new world's seed is drawn.
  // eslint-disable-next-line no-restricted-properties -- the one allowed seed-picking call site
  return generateMapOffThread(resolveMapRequest(setupData, Math.random), createMapWorkerRunner());
}

export type GameClient = Awaited<ReturnType<typeof loadGameClient>>;
