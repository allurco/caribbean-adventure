import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { GameClientLoader } from "./GameClientLoader";
import { loadGameClient, type GameClient } from "./loadGameClient";
import { MapLoadingScreen } from "./board/MapLoadingScreen";
import type { HotseatSave } from "./hotseatSave/hotseatSave";
import { afterSaveAndLeave } from "./hotseatSave/hotseatScreens";
import { startHotseatSession, type HotseatSession } from "./hotseatSave/hotseatSession";
import { browserSaveStorage } from "./hotseatSave/saveStorage";

/** How long the match must rest before it is autosaved, in ms: a burst of moves is one write. */
const AUTOSAVE_DELAY_MS = 1_000;

/** The board's view props (camera and render pins), as `GameClientLoader` passes them on. */
export type VoyageViewProps = Omit<ComponentProps<typeof GameClientLoader>, "client" | "playerID">;

interface HotseatVoyageProps extends VoyageViewProps {
  debugPanel: boolean;
  /** The seats of a new voyage; a restored one keeps its own. */
  seats: number;
  /** The saved voyage to continue; a new one when left out. */
  restore?: HotseatSave;
  /** Save & leave: the voyage is saved (or the player chose to lose it). */
  onLeave: () => void;
  /** The voyage could not be loaded or crashed while shown; its saving is already stopped. */
  onFailed: () => void;
}

/**
 * One hotseat voyage (#300): its client, autosaved, flushed when the page is
 * hidden or left. A voyage that fails to load or throws while rendering
 * (a save the game can no longer play) stops saving and calls `onFailed`.
 */
export function HotseatVoyage({ debugPanel, seats, restore, onLeave, onFailed, ...viewProps }: HotseatVoyageProps) {
  const [GameClientView, setGameClientView] = useState<GameClient>();
  const [saveFailure, setSaveFailure] = useState<"quota" | "unavailable" | null>(null);
  const session = useRef<HotseatSession | null>(null);

  // Under dev StrictMode this effect runs twice, so the map is generated and
  // the client built twice: a cost only. The first run's client is dropped
  // (`live`), and its match, never played, is never saved (hotseatStoreEnhancer).
  useEffect(() => {
    const current = startHotseatSession({
      storage: browserSaveStorage(),
      now: Date.now,
      delayMs: AUTOSAVE_DELAY_MS,
      onSaveResult: (result) => setSaveFailure(result.ok ? null : result.reason),
    });
    session.current = current;
    const flush = () => void current.flush();
    const flushWhenHidden = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    let live = true;
    loadGameClient(undefined, debugPanel, seats, current.persistence(restore)).then(
      // A component is a function, so set it through an updater.
      (ready) => live && setGameClientView(() => ready),
      (error: unknown) => {
        console.error("The voyage could not be loaded.", error);
        current.stop();
        if (live) onFailed();
      }
    );
    return () => {
      live = false;
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      current.flush();
      current.stop();
    };
  }, [debugPanel, seats, restore, onFailed]);

  const saveAndLeave = () => {
    const result = session.current?.flush() ?? { ok: true };
    if (afterSaveAndLeave(result) === "askFirst" && !window.confirm("Your voyage could not be saved: browser storage is full or blocked. Leave anyway and lose it?")) return;
    onLeave();
  };

  // A render error (a restored state this build cannot draw) must not
  // be saved over the voyage, nor leave a blank page: stop saving first.
  const voyageCrashed = (error: unknown) => {
    console.error("The voyage stopped with an error.", error);
    session.current?.stop();
    onFailed();
  };

  if (!GameClientView) return <MapLoadingScreen />;
  return (
    <ErrorBoundary fallback={<MapLoadingScreen />} onError={voyageCrashed}>
      <GameClientView {...viewProps} onSaveAndLeave={saveAndLeave} />
      {saveFailure && (
        <p role="status" className="font-body pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border border-red-700/50 bg-black/60 px-3 py-1.5 text-xs text-red-200">
          {saveFailure === "quota" ? "Autosave failed: browser storage is full." : "Autosave is off: browser storage is blocked."}
        </p>
      )}
    </ErrorBoundary>
  );
}
