import { HUD_TOP_BAR_HEIGHT } from "../board/hudLayout";
import { harbourPath } from "./onlineRoute";
import { BTN_INK } from "./shellStyles";

/**
 * The online match's way out (#113 follow-up): back to the harbour, where
 * the match waits under "Your voyages". Nothing to save first: the server
 * stores the match after every move. Under the turn bar on the right, over
 * the game-over screen too; the hotseat board never shows it.
 */
export function LeaveToHarbour() {
  return (
    <div className="fixed right-5 z-[60] flex flex-col items-end gap-1" style={{ top: HUD_TOP_BAR_HEIGHT + 8 }}>
      <a
        href={harbourPath({ saved: true })}
        className={BTN_INK}
        aria-describedby="leave-to-harbour-note"
        title="Your voyage is saved after every move. Resume it from the harbour."
      >
        Leave to harbour
      </a>
      <span id="leave-to-harbour-note" className="rounded bg-shell-tar/70 px-2 py-0.5 font-garamond text-[13px] text-shell-parchment">
        Voyage saved: resume it any time
      </span>
    </div>
  );
}
