import type { ShipState } from "../game/types";
import { HudCaptainCard } from "./HudCaptainCard";
import { HudShipCard } from "./HudShipCard";
import { tornEdgeClipPath } from "./parchment";
import { HUD_EDGE } from "./hudLayout";
import { safeInset } from "./safeArea";

const TORN_EDGE = tornEdgeClipPath();

interface HudParchmentPanelProps {
  ship: ShipState;
  playerIndex: string;
  playerColor: string;
}

/**
 * The bottom-left HUD: the captain and ship cards on one torn sheet of
 * parchment. The sizes (`w-52` + `w-60`, `p-3.5`, `HUD_EDGE` from the bottom left) are the
 * dark panel's, so nothing moves; the shadow sits on the outer box because the
 * clip-path would cut a shadow on the sheet itself.
 */
export function HudParchmentPanel({ ship, playerIndex, playerColor }: HudParchmentPanelProps) {
  return (
    <section
      aria-label="Your captain and ship"
      className="absolute drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)]"
      style={{ bottom: safeInset("bottom", HUD_EDGE), left: safeInset("left", HUD_EDGE) }}
    >
      <div
        className="flex border border-transparent text-ink bg-parchment bg-[radial-gradient(ellipse_at_40%_35%,var(--color-parchment)_45%,var(--color-parchment-dark))]"
        style={{ clipPath: TORN_EDGE }}
      >
        <div className="w-52 p-3.5 border-r border-dashed border-ink/30">
          <HudCaptainCard captain={ship.captain} playerIndex={playerIndex} playerColor={playerColor} />
        </div>
        <div className="w-60 p-3.5">
          <HudShipCard ship={ship} />
        </div>
      </div>
    </section>
  );
}
