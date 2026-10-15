import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { GameClientLoader } from "./GameClientLoader";
import { loadGameClient, type GameClient } from "./loadGameClient";
import { HotseatStartScreen } from "./board/HotseatStartScreen";
import { MapLoadingScreen } from "./board/MapLoadingScreen";
import { describeHotseatSave } from "./hotseatSave/describeHotseatSave";
import type { HotseatSave } from "./hotseatSave/hotseatSave";
import { startHotseatSession, type HotseatSession } from "./hotseatSave/hotseatSession";
import type { HotseatSaveRead } from "./hotseatSave/parseHotseatSave";
import { browserSaveStorage, clearHotseatSave, readHotseatSave } from "./hotseatSave/saveStorage";

/** How long the match must rest before it is autosaved, in ms: a burst of moves is one write. */
const AUTOSAVE_DELAY_MS = 1_000;

/** The board's view props (camera and render pins), as `GameClientLoader` passes them on. */
type LoaderProps = Omit<ComponentProps<typeof GameClientLoader>, "client" | "playerID">;

interface HotseatGameProps extends LoaderProps {
  debugPanel: boolean;
  /** The seats of a new game. */
  seats: number;
}

/** The start screen (a save to continue, or one that could not be read), or a voyage under way. */
type Screen =
  | { kind: "start"; read: Exclude<HotseatSaveRead, { kind: "none" }>; shownAt: number }
  | { kind: "voyage"; restore?: HotseatSave; id: number };

/**
 * The local hotseat game, saved as it is played (#300). With a save in the
 * browser it opens on the start screen (Continue voyage, or New game);
 * without one, straight into a new game. Save & leave comes back here.
 */
export function HotseatGame({ debugPanel, seats, ...loaderProps }: HotseatGameProps) {
  const [storage] = useState(browserSaveStorage);
  const [screen, setScreen] = useState<Screen>(() => startScreen(readHotseatSave(storage), Date.now()));
  const restoreFailed = useCallback(() => setScreen({ kind: "start", read: { kind: "unreadable", reason: "corrupt" }, shownAt: Date.now() }), []);

  if (screen.kind === "start") {
    const { read } = screen;
    const newGame = () => {
      clearHotseatSave(storage);
      setScreen({ kind: "voyage", id: Date.now() });
    };
    return (
      <HotseatStartScreen
        summary={read.kind === "saved" ? describeHotseatSave(read.save, screen.shownAt) : null}
        unreadable={read.kind === "unreadable" ? read.reason : undefined}
        onContinue={() => read.kind === "saved" && setScreen({ kind: "voyage", restore: read.save, id: Date.now() })}
        onNewGame={newGame}
      />
    );
  }
  return (
    <HotseatVoyage
      key={screen.id}
      {...loaderProps}
      debugPanel={debugPanel}
      seats={seats}
      restore={screen.restore}
      onLeave={() => setScreen(startScreen(readHotseatSave(storage), Date.now()))}
      onRestoreFailed={restoreFailed}
    />
  );
}

/** The start screen for what storage holds, at `now`; straight into a new voyage when it holds nothing. */
function startScreen(read: HotseatSaveRead, now: number): Screen {
  return read.kind === "none" ? { kind: "voyage", id: now } : { kind: "start", read, shownAt: now };
}

interface HotseatVoyageProps extends HotseatGameProps {
  restore?: HotseatSave;
  onLeave: () => void;
  onRestoreFailed: () => void;
}

/** One voyage: its client, autosaved, flushed when the page is hidden or left. */
function HotseatVoyage({ debugPanel, seats, restore, onLeave, onRestoreFailed, ...loaderProps }: HotseatVoyageProps) {
  const [GameClientView, setGameClientView] = useState<GameClient>();
  const [saveFailure, setSaveFailure] = useState<"quota" | "unavailable" | null>(null);
  const session = useRef<HotseatSession | null>(null);
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
        console.error("The saved voyage could not be restored.", error);
        if (live) onRestoreFailed();
      }
    );
    return () => {
      live = false;
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      current.flush();
      current.stop();
    };
  }, [debugPanel, seats, restore, onRestoreFailed]);

  const saveAndLeave = () => {
    const result = session.current?.flush() ?? { ok: true };
    if (!result.ok && !window.confirm("Your voyage could not be saved: browser storage is full or blocked. Leave anyway and lose it?")) return;
    onLeave();
  };

  if (!GameClientView) return <MapLoadingScreen />;
  return (
    <>
      <GameClientView {...loaderProps} onSaveAndLeave={saveAndLeave} />
      {saveFailure && (
        <p role="status" className="font-body pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border border-red-700/50 bg-black/60 px-3 py-1.5 text-xs text-red-200">
          {saveFailure === "quota" ? "Autosave failed: browser storage is full." : "Autosave is off: browser storage is blocked."}
        </p>
      )}
    </>
  );
}
