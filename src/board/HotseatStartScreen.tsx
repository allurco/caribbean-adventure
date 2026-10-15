import { useState } from "react";
import type { HotseatSaveSummary } from "../hotseatSave/describeHotseatSave";

interface HotseatStartScreenProps {
  /** The saved voyage, summarised; null when there is none to continue. */
  summary: HotseatSaveSummary | null;
  /** Why a stored save could not be read, when one could not. */
  unreadable?: "version" | "corrupt";
  onContinue: () => void;
  /** Starts a new game; when there is a save, after the player confirms it will be overwritten. */
  onNewGame: () => void;
}

const UNREADABLE_LINES = {
  version: "Your saved voyage was made by another version of the game and cannot be continued.",
  corrupt: "Your saved voyage could not be read.",
} as const;

const BUTTON = "font-heading w-full px-6 py-3 rounded-lg text-sm uppercase tracking-wider cursor-pointer transition-colors border";
const PRIMARY = `${BUTTON} bg-amber-700 hover:bg-amber-600 text-amber-50 border-amber-500/50`;
const SECONDARY = `${BUTTON} bg-black/30 hover:bg-amber-900/40 text-amber-200 border-amber-700/40`;

/** The hotseat game's start (#300): continue the saved voyage, or start a new one. */
export function HotseatStartScreen({ summary, unreadable, onContinue, onNewGame }: HotseatStartScreenProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a1929] px-4">
      <div className="w-full max-w-sm rounded-2xl border-2 border-amber-600/40 bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900 p-7 text-center shadow-2xl shadow-black/60">
        <h1 className="font-heading mb-6 text-2xl uppercase tracking-[0.2em] text-amber-300">Project Caribbean</h1>

        {unreadable && <p className="font-body mb-5 text-sm text-amber-200/80">{UNREADABLE_LINES[unreadable]}</p>}

        {summary && !confirming && (
          <>
            <div className="mb-5 rounded-lg border border-amber-800/40 bg-black/25 px-4 py-3 text-left">
              <p className="font-heading text-sm uppercase tracking-wider text-amber-200">
                {summary.turn} · {summary.seats}
              </p>
              {summary.captains.length > 0 && <p className="font-body mt-1 text-sm text-amber-100/90">{summary.captains.join(", ")}</p>}
              <p className="font-body mt-1 text-xs text-amber-200/60">
                {summary.map} · {summary.saved}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button type="button" className={PRIMARY} onClick={onContinue} autoFocus>
                Continue voyage
              </button>
              <button type="button" className={SECONDARY} onClick={() => setConfirming(true)}>
                New game
              </button>
            </div>
          </>
        )}

        {summary && confirming && (
          <div role="alertdialog" aria-labelledby="overwrite-save">
            <p id="overwrite-save" className="font-body mb-5 text-sm text-amber-100/90">
              A new game will overwrite your saved voyage. It cannot be brought back.
            </p>
            <div className="flex flex-col gap-3">
              <button type="button" className={PRIMARY} onClick={onNewGame} autoFocus>
                Overwrite and set sail
              </button>
              <button type="button" className={SECONDARY} onClick={() => setConfirming(false)}>
                Keep my voyage
              </button>
            </div>
          </div>
        )}

        {!summary && (
          <button type="button" className={PRIMARY} onClick={onNewGame} autoFocus>
            New game
          </button>
        )}
      </div>
    </div>
  );
}
