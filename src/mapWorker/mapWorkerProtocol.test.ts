import { describe, it, expect } from "vitest";
import { answerMapWorkerRequest, readMapWorkerResponse } from "./mapWorkerProtocol";
import { generateMapFor } from "../game/mapRequest";
import type { MapSizeId } from "../game/mapConfig";

describe("answerMapWorkerRequest", () => {
  it("answers with the cells the main thread generates for the request", () => {
    const request = { mapSize: "small" as const, mapSeed: 7 };
    expect(answerMapWorkerRequest({ request })).toEqual({ ok: true, cells: generateMapFor(request) });
  });

  it("answers with the error instead of throwing when generation fails", () => {
    const answer = answerMapWorkerRequest({ request: { mapSize: "huge" as MapSizeId, mapSeed: 1 } });
    expect(answer).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe("readMapWorkerResponse", () => {
  it("reads the cells out of a successful answer", () => {
    const cells = generateMapFor({ mapSize: "small", mapSeed: 3 });
    expect(readMapWorkerResponse({ ok: true, cells })).toBe(cells);
  });

  it("reads nothing out of a failed or malformed answer", () => {
    for (const data of [{ ok: false, error: "boom" }, { ok: true }, { ok: true, cells: "x" }, null, "cells", 42]) {
      expect(readMapWorkerResponse(data)).toBeUndefined();
    }
  });
});
