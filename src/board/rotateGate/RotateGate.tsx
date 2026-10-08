import { useState } from "react";
import { DWindowBand } from "../prototypeShell/variantD/DWindowBand";
import { BTN_BRASS, GARAMOND, INK_SOFT, PARCHMENT } from "../prototypeShell/variantD/theme";
import { usePeriodFonts } from "../prototypeShell/variantD/usePeriodFonts";
import { canLockLandscape, lockLandscape } from "./landscapeLock";
import { RotateGlyph } from "./RotateGlyph";

const HARBOUR_STILL_URL = "/prototype-shell/harbour-still.jpg";

/**
 * The rotate gate (#104): Caribbean Merchant is landscape-only on phones, so a
 * phone held upright sees this over whatever view is mounted (shell or game).
 * It only overlays: the app stays mounted underneath (inert while this shows),
 * so turning the phone back reveals it exactly as it was. Dressed in variant
 * D's harbour: the still behind, dimmed, a hanging nameboard and a parchment
 * card. "Turn it for me" appears only where the browser can lock (Android).
 */
export function RotateGate() {
  usePeriodFonts();
  const [canLock] = useState(canLockLandscape);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotate-gate-title"
      // above everything, the boardgame.io debug panel (z 99999) included
      className="fixed inset-0 z-[2147483647] flex flex-col overflow-hidden bg-[#082633] touch-none select-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] px-[max(16px,env(safe-area-inset-left))]"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HARBOUR_STILL_URL})` }} />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,14,20,0.35),rgba(5,14,20,0.72)_60%,rgba(5,14,20,0.85))]" />

      <div className="relative mx-auto w-fit max-w-full" id="rotate-gate-title">
        <DWindowBand title="Turn your ship" meta="Hold your phone sideways to take the helm" />
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center pb-10">
        <div style={PARCHMENT} className={`${GARAMOND} w-full max-w-[320px] rounded-[3px] px-6 pt-5 pb-6 flex flex-col items-center text-center`}>
          <RotateGlyph className="w-32 h-32" />
          <p className="text-[18px] leading-snug text-[#2b1d10] mt-1 text-balance">Caribbean Merchant is played in landscape.</p>
          <p className={`text-[15px] italic ${INK_SOFT} mt-1.5 leading-snug`}>Your game waits underneath, just as you left it.</p>
          {canLock && (
            <button onClick={() => void lockLandscape()} className={`${BTN_BRASS} mt-5 w-full !py-3`}>
              Turn it for me
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
