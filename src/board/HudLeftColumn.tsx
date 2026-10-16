import type { ReactNode } from "react";
import { HUD_GLORY_BOARD_LEFT, HUD_GLORY_BOARD_TOP, HUD_GLORY_BOARD_WIDTH } from "./hudLayout";
import { safeInset } from "./safeArea";

/**
 * The HUD's left column under the top-left row: the glory board, then the
 * event log (#246), in flow with a gap, so the log sits under however many
 * captains the board lists.
 */
export function HudLeftColumn({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute flex flex-col gap-2 pointer-events-none"
      style={{ top: safeInset("top", HUD_GLORY_BOARD_TOP), left: safeInset("left", HUD_GLORY_BOARD_LEFT), width: HUD_GLORY_BOARD_WIDTH }}
    >
      {children}
    </div>
  );
}
