import { describe, expect, it } from "vitest";
import { PLAY_ACTIONS } from "./playActions";
import { localGamePath, parseShellPage } from "./shellRoute";

describe("PLAY_ACTIONS", () => {
  it("leads with a private room, the one way into an online match today", () => {
    expect(PLAY_ACTIONS[0]).toMatchObject({ title: "Open a private room", href: "/?view=rooms" });
  });

  it("offers the lobby, the party and the ranked queue, each marked as coming", () => {
    for (const title of ["Browse the lobby", "Your party", "Ranked queue"]) {
      const action = PLAY_ACTIONS.find((a) => a.title === title);
      expect(action?.sub).toMatch(/coming/i);
    }
  });

  it("keeps the local game a click away, now that the root URL is the shell", () => {
    expect(PLAY_ACTIONS.find((a) => a.href === localGamePath())).toBeDefined();
  });

  it("never links to a dead end: every action opens a shell page or the local game", () => {
    for (const action of PLAY_ACTIONS) {
      expect(action.href === localGamePath() || parseShellPage(action.href.slice(1)) !== null).toBe(true);
    }
  });
});
