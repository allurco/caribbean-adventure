import { useCallback, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { HotseatStartScreen } from "./board/HotseatStartScreen";
import { HotseatVoyage, type VoyageViewProps } from "./HotseatVoyage";
import { describeHotseatSave } from "./hotseatSave/describeHotseatSave";
import { afterRestoreFailed, afterStartScreenFailed, continueVoyage, newGameOverwrites, newVoyage, openingScreen, type HotseatScreen, type VoyageRequest } from "./hotseatSave/hotseatScreens";
import { browserSaveStorage, clearHotseatSave, readHotseatSave, setAsideHotseatSave } from "./hotseatSave/saveStorage";

interface HotseatGameProps extends VoyageViewProps {
  debugPanel: boolean;
  /** The seats of a new game. */
  seats: number;
  /** What the URL asks of the game (`?players=`): a save is continued only when it matches. */
  request: VoyageRequest;
}

/**
 * The local hotseat game, saved as it is played (#300). With a save in the
 * browser it opens on the start screen (Continue voyage, or New game);
 * without one, straight into a new game. Save & leave comes back here. The
 * screens and their transitions are `hotseatScreens.ts`.
 */
export function HotseatGame({ debugPanel, seats, request, ...viewProps }: HotseatGameProps) {
  const [storage] = useState(browserSaveStorage);
  const [screen, setScreen] = useState<HotseatScreen>(() => openingScreen(readHotseatSave(storage), request, Date.now()));
  const voyageFailed = useCallback(() => {
    // Set aside, so a save that cannot be played is not offered again
    setAsideHotseatSave(storage);
    setScreen(afterRestoreFailed(Date.now()));
  }, [storage]);

  // A save the start screen throws on (one parseHotseatSave let through)
  // must not blank the page on every load: set it aside, say it could not
  // be read, and offer New game.
  const startScreenFailed = useCallback(
    (error: unknown) => {
      console.error("The saved voyage could not be shown.", error);
      setAsideHotseatSave(storage);
      setScreen(afterStartScreenFailed(Date.now()));
    },
    [storage]
  );

  if (screen.kind === "start") {
    return (
      <ErrorBoundary fallback={null} onError={startScreenFailed} resetKeys={[screen]}>
        <SavedVoyageStart
          screen={screen}
          onContinue={() => setScreen(continueVoyage(screen, Date.now()))}
          onNewGame={() => {
            clearHotseatSave(storage);
            setScreen(newVoyage(Date.now()));
          }}
        />
      </ErrorBoundary>
    );
  }
  return (
    <HotseatVoyage
      key={screen.id}
      {...viewProps}
      debugPanel={debugPanel}
      seats={seats}
      restore={screen.restore}
      onLeave={() => setScreen(openingScreen(readHotseatSave(storage), request, Date.now()))}
      onFailed={voyageFailed}
    />
  );
}

interface SavedVoyageStartProps {
  screen: Extract<HotseatScreen, { kind: "start" }>;
  onContinue: () => void;
  onNewGame: () => void;
}

/** The start screen for `screen`, its save summarised while it renders, so the error boundary around it catches a summary that throws. */
function SavedVoyageStart({ screen, onContinue, onNewGame }: SavedVoyageStartProps) {
  return (
    <HotseatStartScreen
      summary={screen.save && describeHotseatSave(screen.save, screen.shownAt)}
      canContinue={screen.continuable}
      notice={screen.notice}
      confirmsNewGame={newGameOverwrites(screen)}
      onContinue={onContinue}
      onNewGame={onNewGame}
    />
  );
}
