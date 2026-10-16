import { useEffect, useRef, useState } from "react";
import { shellSafeInset } from "../board/safeArea";
import { HarbourStill } from "../online/HarbourStill";
import { Nameboard } from "../online/Nameboard";
import { BTN_BRASS, SHEET } from "../online/shellStyles";
import { useShellFonts } from "../online/useShellFonts";
import { browserCanLockLandscape, browserLockPorts, lockLandscape } from "./landscapeLock";
import { ROTATE_GATE_Z } from "./rotateGateLayer";
import { rotateGatePresence } from "./rotateGatePresence";
import { RotateGlyph } from "./RotateGlyph";

/**
 * The rotate gate (#123): Caribbean Merchant is played in landscape, so a
 * phone held upright sees this over whatever is mounted, the shell or the
 * game. It only covers: the app stays mounted underneath, inert while this
 * shows (`LandscapeOnPhones`), so turning the phone back finds it as it was.
 * In the Harbour launcher's dress: the harbour still behind, dimmed, a
 * hanging nameboard and a parchment card. "Turn it for me" shows only where
 * the browser can lock the screen (Android).
 */
export function RotateGate() {
  useShellFonts();
  const [canLock] = useState(browserCanLockLandscape);
  const self = useRef<HTMLDivElement>(null);
  // Up while mounted: window key handlers ignore keys, the board pauses its frames
  useEffect(() => rotateGatePresence.show(), []);
  // Focus comes in here: the app behind is inert, so focus there is lost
  useEffect(() => self.current?.focus(), []);
  return (
    <div
      ref={self}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotate-gate-title"
      className="fixed inset-0 flex touch-none outline-none flex-col overflow-hidden bg-shell-harbour select-none"
      style={{
        zIndex: ROTATE_GATE_Z,
        paddingTop: shellSafeInset("top", 0),
        paddingBottom: shellSafeInset("bottom", 0),
        paddingLeft: shellSafeInset("left", 16),
        paddingRight: shellSafeInset("right", 16),
      }}
    >
      <HarbourStill />
      <div aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-shell-scrim/35 via-shell-scrim/72 via-60% to-shell-scrim/85" />

      <div id="rotate-gate-title" className="relative">
        <Nameboard title="Turn your ship" meta="Hold your phone sideways" />
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center pb-10">
        <div className={`${SHEET} flex w-full max-w-[320px] flex-col items-center px-6 pt-5 pb-6 text-center`}>
          <RotateGlyph className="h-32 w-32" />
          <p className="mt-1 text-[18px] leading-snug text-balance">Caribbean Merchant is played in landscape.</p>
          <p className="mt-1.5 text-[15px] leading-snug text-shell-ink-soft italic">Your game waits underneath, just as you left it.</p>
          {canLock && (
            <button type="button" onClick={() => void lockLandscape(browserLockPorts())} className={`${BTN_BRASS} mt-5 w-full py-3!`}>
              Turn it for me
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
