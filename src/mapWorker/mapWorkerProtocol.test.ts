import { describe, it, expect } from "vitest";
import { answerMapWorkerRequest, readMapWorkerResponse } from "./mapWorkerProtocol";
import { generateMapFor } from "../game/mapRequest";
import type { MapSizeId } from "../game/mapConfig";

describe("answerMapWorkerRequest", () => {
  it("answers with the map (cells and regions) the main thread generates for the request", () => {
    const request = { mapSize: "small" as const, mapSeed: 7 };
    expect(answerMapWorkerRequest({ request })).toEqual({ ok: true, world: generateMapFor(request) });
  });

  it("answers with the error instead of throwing when generation fails", () => {
    const answer = answerMapWorkerRequest({ request: { mapSize: "huge" as MapSizeId, mapSeed: 1 } });
    expect(answer).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe("readMapWorkerResponse", () => {
  it("reads the map out of a successful answer", () => {
    const world = generateMapFor({ mapSize: "small", mapSeed: 3 });
    expect(readMapWorkerResponse({ ok: true, world })).toBe(world);
  });

  it("reads nothing out of a failed or malformed answer", () => {
    for (const data of [
      { ok: false, error: "boom" },
      { ok: true },
      { ok: true, world: "x" },
      { ok: true, world: { cells: [] } },
      { ok: true, world: { cells: "x", regions: [] } },
      null,
      "cells",
      42,
    ]) {
      expect(readMapWorkerResponse(data)).toBeUndefined();
    }
  });
});
