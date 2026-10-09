import { describe, it, expect, vi } from "vitest";
import { generateMapOffThread } from "./generateMapOffThread";
import type { RunMapWorker } from "./generateMapOffThread";
import { answerMapWorkerRequest } from "./mapWorkerProtocol";
import { generateMapFor } from "../game/mapRequest";
import type { MapRequest } from "../game/mapRequest";

/**
 * A stand-in for the real worker: the same answer the worker script gives,
 * asynchronously, with both messages structured-cloned the way postMessage
 * clones them.
 */
const fakeWorker: RunMapWorker = async (message) =>
  structuredClone(answerMapWorkerRequest(structuredClone(message)));

const REQUESTS: MapRequest[] = [
  { mapSize: "small", mapSeed: 1 },
  { mapSize: "small", mapSeed: -2147483648 },
  { mapSize: "medium", mapSeed: 31337 },
  { mapSize: "medium", mapSeed: 0 },
  { mapSize: "large", mapSeed: 2147483647 },
  { mapSize: "large", mapSeed: 424242 },
];

describe("generateMapOffThread", () => {
  it("returns exactly the main-thread map for every size and several seeds", async () => {
    for (const request of REQUESTS) {
      expect(await generateMapOffThread(request, fakeWorker)).toEqual({ ...request, cells: generateMapFor(request) });
    }
  });

  it("posts only the request to the worker", async () => {
    const run = vi.fn(fakeWorker);
    await generateMapOffThread({ mapSize: "small", mapSeed: 5 }, run);
    expect(run).toHaveBeenCalledWith({ request: { mapSize: "small", mapSeed: 5 } });
  });

  describe("falls back to the main thread", () => {
    const request: MapRequest = { mapSize: "small", mapSeed: 99 };
    const expected = { ...request, cells: generateMapFor(request) };
    const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => {});

    it("where workers are unavailable", async () => {
      expect(await generateMapOffThread(request, undefined)).toEqual(expected);
    });

    it("when the worker fails to start or crashes", async () => {
      const warn = quiet();
      expect(await generateMapOffThread(request, () => Promise.reject(new Error("no worker")))).toEqual(expected);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("when the worker answers with an error or garbage", async () => {
      const warn = quiet();
      expect(await generateMapOffThread(request, async () => ({ ok: false, error: "boom" }))).toEqual(expected);
      expect(await generateMapOffThread(request, async () => "not an answer")).toEqual(expected);
      warn.mockRestore();
    });
  });
});
