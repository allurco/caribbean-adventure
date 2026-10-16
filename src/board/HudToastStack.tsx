import type { ReactNode } from "react";
import { safeInset } from "./safeArea";

/**
 * The HUD's toasts in one centred column under the turn bar (#340): the
 * mission toast, then the open sea's line, each in flow with a gap, so two
 * that fire at the end of the same turn stack instead of overlapping. `top`
 * is the column's (`hudToastTop`).
 */
export function HudToastStack({ top, children }: { top: number; children: ReactNode }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 pointer-events-none" style={{ top: safeInset("top", top) }}>
      {children}
    </div>
  );
}
