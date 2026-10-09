import type { RunMapWorker } from "./generateMapOffThread";

/**
 * Runs each message in a fresh map worker that is terminated once it has
 * answered (a map is generated once per load). Undefined where the browser
 * has no workers, so `generateMapOffThread` falls back to the main thread.
 */
export function createMapWorkerRunner(): RunMapWorker | undefined {
  if (typeof Worker === "undefined") return undefined;
  return (message) =>
    new Promise((resolve, reject) => {
      // Written inline so Vite finds and bundles the worker script.
      const worker = new Worker(new URL("./mapWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<unknown>) => {
        worker.terminate();
        resolve(event.data);
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message || "The map worker failed to load or crashed"));
      };
      worker.onmessageerror = () => {
        worker.terminate();
        reject(new Error("The map worker's answer could not be read"));
      };
      worker.postMessage(message);
    });
}
