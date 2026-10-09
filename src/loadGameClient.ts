import { Client } from "boardgame.io/react";
import { Caribbean, withGeneratedMap } from "./game/Game";
import type { CaribbeanSetupData } from "./game/Game";
import { resolveMapRequest } from "./game/mapRequest";
import { CaribbeanBoard } from "./board/Board";
import { generateMapOffThread } from "./mapWorker/generateMapOffThread";
import { createMapWorkerRunner } from "./mapWorker/createMapWorkerRunner";

/**
 * The local hotseat client, once its map is ready (#124). boardgame.io's
 * `setup()` is synchronous, so the map is generated first, in a worker (on
 * the main thread where there is none), and the client's game starts on it.
 * `setupData` is the dev URL pin (#74): its size and seed, else random ones.
 */
export async function loadGameClient(setupData: CaribbeanSetupData | undefined) {
  const map = await generateMapOffThread(resolveMapRequest(setupData, Math.random), createMapWorkerRunner());
  return Client({ game: withGeneratedMap(Caribbean, map), board: CaribbeanBoard });
}

export type GameClient = Awaited<ReturnType<typeof loadGameClient>>;
