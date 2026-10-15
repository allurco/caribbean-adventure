import { describe, it, expect } from "vitest";
import type { HotseatSave } from "./hotseatSave";
import { afterRestoreFailed, afterSaveAndLeave, openingScreen, newGameOverwrites, continueVoyage, newVoyage } from "./hotseatScreens";

/** A save of a `numPlayers`-seat match on the small map with seed 7; only what the screens read is filled in. */
function saveFor(numPlayers: number): HotseatSave {
  return { map: { mapSize: "small", mapSeed: 7 }, state: { ctx: { numPlayers } } } as unknown as HotseatSave;
}

describe("the hotseat game's screens (#300)", () => {
  it("goes straight into a new voyage when nothing is saved", () => {
    expect(openingScreen({ kind: "none" }, {}, 5)).toEqual({ kind: "voyage", id: 5 });
  });

  it("offers to continue a save from a plain URL, whatever its seats", () => {
    const save = saveFor(3);
    const screen = openingScreen({ kind: "saved", save }, {}, 5);
    expect(screen).toEqual({ kind: "start", save, continuable: true, notice: null, shownAt: 5 });
    expect(continueVoyage(screen, 9)).toEqual({ kind: "voyage", restore: save, id: 9 });
  });

  it("offers to continue only a save with the seats a hotseat URL asks for", () => {
    const save = saveFor(2);
    expect(openingScreen({ kind: "saved", save }, { players: 2 }, 5)).toMatchObject({ kind: "start", continuable: true, notice: null });
    const other = openingScreen({ kind: "saved", save }, { players: 3 }, 5);
    expect(other).toEqual({ kind: "start", save, continuable: false, notice: "mismatch", shownAt: 5 });
    // Nothing to continue: Continue does nothing, New game overwrites the save
    expect(continueVoyage(other, 9)).toBe(other);
    expect(newGameOverwrites(other)).toBe(true);
  });

  it("offers to continue only a save on the map size and seed a URL pins", () => {
    const save = saveFor(1);
    expect(openingScreen({ kind: "saved", save }, { setupData: { mapSize: "small", mapSeed: 7 } }, 5)).toMatchObject({ continuable: true });
    expect(openingScreen({ kind: "saved", save }, { setupData: { mapSeed: 7 } }, 5)).toMatchObject({ continuable: true });
    expect(openingScreen({ kind: "saved", save }, { setupData: { mapSize: "large" } }, 5)).toMatchObject({ continuable: false, notice: "mismatch" });
    expect(openingScreen({ kind: "saved", save }, { setupData: { mapSeed: 8 } }, 5)).toMatchObject({ continuable: false, notice: "mismatch" });
  });

  it("tells why a stored save cannot be read, and starts afresh over it without asking", () => {
    const screen = openingScreen({ kind: "unreadable", reason: "version" }, {}, 5);
    expect(screen).toEqual({ kind: "start", save: null, continuable: false, notice: "version", shownAt: 5 });
    expect(newGameOverwrites(screen)).toBe(false);
    expect(newVoyage(9)).toEqual({ kind: "voyage", id: 9 });
  });

  it("asks before a new game overwrites a save that could be continued", () => {
    expect(newGameOverwrites(openingScreen({ kind: "saved", save: saveFor(1) }, {}, 5))).toBe(true);
  });

  it("comes back to the start screen, saying so, when a voyage cannot be restored", () => {
    expect(afterRestoreFailed(5)).toEqual({ kind: "start", save: null, continuable: false, notice: "failed", shownAt: 5 });
  });

  it("leaves at once when the voyage is saved, and asks first when it could not be", () => {
    expect(afterSaveAndLeave({ ok: true })).toBe("leave");
    expect(afterSaveAndLeave({ ok: false, reason: "quota" })).toBe("askFirst");
    expect(afterSaveAndLeave({ ok: false, reason: "unavailable" })).toBe("askFirst");
  });
});
