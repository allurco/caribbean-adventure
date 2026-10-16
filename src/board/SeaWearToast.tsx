import { useEffect } from "react";

/** How long the line stays up, in ms. */
const SHOWN_FOR = 3200;

/**
 * The open sea has worn a ship (#340): a short parchment line (one per ship) under the
 * turn bar, gone after a few seconds. Placed by the HUD's toast column
 * (`HudToastStack`), under the mission toast when both are up.
 */
export function SeaWearToast({ lines, onDone }: { lines: readonly string[]; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, SHOWN_FOR);
    return () => clearTimeout(timer);
  }, [lines, onDone]);
  return (
    <div className="pointer-events-none" role="status">
      <div className="px-4 py-2 rounded-md border border-ink/25 bg-parchment/95 text-ink text-sm font-body tracking-wide shadow-[0_6px_16px_rgba(0,0,0,0.45)]">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}
