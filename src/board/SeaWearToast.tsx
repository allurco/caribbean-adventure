import { useEffect } from "react";
import { safeInset } from "./safeArea";

/** How long the line stays up, in ms. */
const SHOWN_FOR = 3200;

/**
 * The open sea has worn a ship (#340): a short parchment line under the
 * turn bar, gone after a few seconds. `top` is where it sits (`hudToastTop`).
 */
export function SeaWearToast({ text, top, onDone }: { text: string; top: number; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, SHOWN_FOR);
    return () => clearTimeout(timer);
  }, [text, onDone]);
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-40 pointer-events-none" style={{ top: safeInset("top", top) }} role="status">
      <div className="px-4 py-2 rounded-md border border-ink/25 bg-parchment/95 text-ink text-sm font-body tracking-wide shadow-[0_6px_16px_rgba(0,0,0,0.45)]">
        {text}
      </div>
    </div>
  );
}
