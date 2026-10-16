import type { CaribbeanSetupData } from "../game/types";
import type { HotseatSave } from "./hotseatSave";
import type { HotseatSaveRead } from "./parseHotseatSave";
import type { SaveWriteResult } from "./saveStorage";

/** What the URL asks of the local game: a hotseat game's seats (`?players=`), a pinned map size or seed. */
export interface VoyageRequest {
  players?: number;
  setupData?: CaribbeanSetupData;
}

/**
 * What the start screen says above its buttons: the stored save was made by
 * another version, could not be read, could not be restored (and was set
 * aside), or is not the game the URL asks for (other seats or map).
 */
export type StartNotice = "version" | "corrupt" | "failed" | "mismatch";

/** The hotseat game's screens (#300): the start screen, or a voyage under way (restored, or new). */
export type HotseatScreen =
  | {
      kind: "start";
      /** The stored save, when it could be read. */
      save: HotseatSave | null;
      /** Whether Continue voyage is offered. */
      continuable: boolean;
      notice: StartNotice | null;
      /** When the screen was shown, in ms since the epoch (for "Saved 5 minutes ago"). */
      shownAt: number;
    }
  | { kind: "voyage"; restore?: HotseatSave; id: number };

/** The screen the game opens on at `now`, for what storage holds and what the URL asks: straight into a new voyage when nothing is stored. */
export function openingScreen(read: HotseatSaveRead, request: VoyageRequest, now: number): HotseatScreen {
  if (read.kind === "none") return newVoyage(now);
  if (read.kind === "unreadable") return { kind: "start", save: null, continuable: false, notice: read.reason, shownAt: now };
  const continuable = matchesRequest(read.save, request);
  return { kind: "start", save: read.save, continuable, notice: continuable ? null : "mismatch", shownAt: now };
}

/** Continue voyage: the stored save, restored; the same screen when it cannot be continued. */
export function continueVoyage(screen: HotseatScreen, now: number): HotseatScreen {
  return screen.kind === "start" && screen.continuable && screen.save ? { kind: "voyage", restore: screen.save, id: now } : screen;
}

/** New game: a new voyage. */
export function newVoyage(now: number): HotseatScreen {
  return { kind: "voyage", id: now };
}

/** Whether New game would overwrite a readable save, so it asks first. */
export function newGameOverwrites(screen: HotseatScreen): boolean {
  return screen.kind === "start" && screen.save !== null;
}

/** Back on the start screen after a voyage failed to restore (its save set aside). */
export function afterRestoreFailed(now: number): HotseatScreen {
  return { kind: "start", save: null, continuable: false, notice: "failed", shownAt: now };
}

/** Back on the start screen after it threw while showing the stored save (set aside): it could not be read, so only New game is offered. */
export function afterStartScreenFailed(now: number): HotseatScreen {
  return { kind: "start", save: null, continuable: false, notice: "corrupt", shownAt: now };
}

/** Save & leave, after the save was written or failed: leave at once, or ask before losing the voyage. */
export function afterSaveAndLeave(result: SaveWriteResult): "leave" | "askFirst" {
  return result.ok ? "leave" : "askFirst";
}

/** Whether `save` is the game `request` asks for: its seats, and its map size and seed where pinned. */
function matchesRequest(save: HotseatSave, request: VoyageRequest): boolean {
  const { players, setupData } = request;
  if (players !== undefined && save.state.ctx.numPlayers !== players) return false;
  if (setupData?.mapSize !== undefined && save.map.mapSize !== setupData.mapSize) return false;
  return setupData?.mapSeed === undefined || save.map.mapSeed === setupData.mapSeed;
}
