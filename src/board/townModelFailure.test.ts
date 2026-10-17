import { afterEach, describe, expect, it, vi } from "vitest";
import { logTownModelFailure } from "./townModelFailure";
import { TOWN_MODELS } from "./townModels";

describe("a town model's failure", () => {
  afterEach(() => vi.restoreAllMocks());

  // Every world copy mounts its own tavern draw, and each one's error boundary reports the same failure.
  it("is logged once however many copies of the piece report it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let copy = 0; copy < 3; copy++) logTownModelFailure(TOWN_MODELS.tavern, new Error("404"));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe("[town] model tavern.glb failed to load; drawing the code-built tavern");
  });
});
