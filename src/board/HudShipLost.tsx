import { tornEdgeClipPath } from "./parchment";
import { HUD_EDGE } from "./hudLayout";
import { safeInset } from "./safeArea";

const TORN_EDGE = tornEdgeClipPath();

interface HudShipLostProps {
  /** What the board calls the seat (`seatName`). */
  name: string;
  playerColor: string;
  /** Out of the game: no captain was left to take command (#265). */
  out: boolean;
}

/**
 * The bottom-left HUD once the seat's ship is gone (`hudShip` is null): the
 * loss, on the same parchment, in place of the captain and ship cards, until
 * the seat picks a new captain on its next turn (#265).
 */
export function HudShipLost({ name, playerColor, out }: HudShipLostProps) {
  return (
    <section
      aria-label="Your ship is lost"
      className="absolute drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)]"
      style={{ bottom: safeInset("bottom", HUD_EDGE), left: safeInset("left", HUD_EDGE) }}
    >
      <div
        className="w-64 p-3.5 border border-transparent text-ink bg-parchment bg-[radial-gradient(ellipse_at_40%_35%,var(--color-parchment)_45%,var(--color-parchment-dark))]"
        style={{ clipPath: TORN_EDGE }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div aria-hidden="true" className="w-2.5 h-2.5 rounded-sm ring-1 ring-ink/40" style={{ backgroundColor: playerColor }} />
          <h2 className="font-heading text-[11px] font-bold text-ink-faded uppercase tracking-widest">{name}</h2>
        </div>
        <div className="font-heading text-ink text-sm font-bold leading-tight">{out ? "You are out of the game" : "Your ship is lost"}</div>
        <div className="text-ink-faded text-[11px] mt-1">
          {out
            ? "No captain is left to take command. Your glory stands; you watch the table from here."
            : "Her captain went down with her, and her cargo and gold. A new captain takes command on your next turn, at your home port."}
        </div>
      </div>
    </section>
  );
}
