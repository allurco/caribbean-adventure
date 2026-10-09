// The map worker (#124): a thin wrapper that answers each request with the
// pure generator from src/game/. Started by createMapWorkerRunner.
import { answerMapWorkerRequest } from "./mapWorkerProtocol";
import type { MapWorkerRequest, MapWorkerResponse } from "./mapWorkerProtocol";

/** The parts of a dedicated worker's global scope used here (the app's types are DOM, not WebWorker). */
interface MapWorkerScope {
  onmessage: ((event: MessageEvent<MapWorkerRequest>) => void) | null;
  postMessage(message: MapWorkerResponse): void;
}

const scope = self as unknown as MapWorkerScope;
scope.onmessage = (event) => scope.postMessage(answerMapWorkerRequest(event.data));
