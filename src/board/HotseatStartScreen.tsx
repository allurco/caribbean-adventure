import { useState } from "react";
import type { HotseatSaveSummary } from "../hotseatSave/describeHotseatSave";
import type { StartNotice } from "../hotseatSave/hotseatScreens";

interface HotseatStartScreenProps {
  /** The saved voyage, summarised; null when none could be read. */
  summary: HotseatSaveSummary | null;
  /** Whether Continue voyage is offered. */
  canContinue: boolean;
  /** Why the stored save cannot be continued, when it cannot. */
  notice: StartNotice | null;
  /** Whether New game asks first, because it overwrites the saved voyage. */
  confirmsNewGame: boolean;
  onContinue: () => void;
  onNewGame: () => void;
}

const NOTICE_LINES: Record<StartNotice, string> = {
  version: "Your saved voyage was made by another version of the game and cannot be continued.",
  corrupt: "Your saved voyage could not be read.",
  failed: "Your saved voyage could not be continued in this version of the game, so it has been set aside.",
  mismatch: "Your saved voyage was played with other seats or on another map, so it cannot be continued here.",
};

const BUTTON = "font-heading w-full px-6 py-3 rounded-lg text-sm uppercase tracking-wider cursor-pointer transition-colors border";
const PRIMARY = `${BUTTON} bg-amber-700 hover:bg-amber-600 text-amber-50 border-amber-500/50`;
const SECONDARY = `${BUTTON} bg-black/30 hover:bg-amber-900/40 text-amber-200 border-amber-700/40`;

/** The hotseat game's start (#300): continue the saved voyage, or start a new one. */
export function HotseatStartScreen({ summary, canContinue, notice, confirmsNewGame, onContinue, onNewGame }: HotseatStartScreenProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a1929] px-4">
      <div className="w-full max-w-sm rounded-2xl border-2 border-amber-600/40 bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900 p-7 text-center shadow-2xl shadow-black/60">
        <h1 className="font-heading mb-6 text-2xl uppercase tracking-[0.2em] text-amber-300">Project Caribbean</h1>

        {notice && <p className="font-body mb-5 text-sm text-amber-200/80">{NOTICE_LINES[notice]}</p>}

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
              {canContinue && (
                <button type="button" className={PRIMARY} onClick={onContinue} autoFocus>
                  Continue voyage
                </button>
              )}
              <button type="button" className={canContinue ? SECONDARY : PRIMARY} onClick={() => (confirmsNewGame ? setConfirming(true) : onNewGame())} autoFocus={!canContinue}>
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
