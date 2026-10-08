import { useEffect, useState } from "react";
import { PARTY } from "../../fixtures";
import { PresenceDot, Seal } from "../../primitives";
import type { Screen } from "../../shellKeys";
import { DPartyBoard, DPartyChat } from "../DPartyBoard";
import { FOCUS_RING, GARAMOND, TIMBER_H } from "../theme";

/**
 * THROWAWAY PROTOTYPE: the party on a phone held sideways. The crew sit as a
 * row of seals on a timber tab in the top right corner, overlapping only by
 * a hair so every seal and its presence dot stays legible. A tap opens the
 * desktop party board as an overlay beneath it; its chat slate opens to the
 * board's left, where a sideways phone has room.
 */
export function DSealCluster({ go }: { go: (s: Screen) => void }) {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const goAndClose = (s: Screen) => {
    setOpen(false);
    go(s);
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="d-party-overlay"
        aria-label={`Party of ${PARTY.members.length}, ${open ? "close" : "open"} the party board`}
        style={TIMBER_H}
        className={`${FOCUS_RING} absolute z-40 top-2.5 right-[max(12px,env(safe-area-inset-right))] h-11 flex items-center pl-1.5 pr-2 rounded-full border border-[#8a6a33]/70 shadow-[0_3px_0_#0d0703,0_6px_14px_rgba(0,0,0,0.4)] cursor-pointer active:translate-y-[2px]`}
      >
        <span className="flex -space-x-1">
          {PARTY.members.map((p) => (
            <span key={p.id} className="relative">
              <Seal player={p} size="sm" />
              <PresenceDot presence={p.presence} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-[#2a1a0e]" />
            </span>
          ))}
        </span>
      </button>

      {open && (
        <>
          <div aria-hidden="true" onClick={() => setOpen(false)} className="absolute inset-0 z-20 bg-[#050c12]/45" />
          <div
            id="d-party-overlay"
            role="dialog"
            aria-label="Party"
            className={`${GARAMOND} absolute z-30 top-16 bottom-[max(12px,env(safe-area-inset-bottom))] right-[max(12px,env(safe-area-inset-right))] flex flex-row-reverse items-start gap-3 pointer-events-none`}
          >
            <div className="w-56 pointer-events-auto">
              <DPartyBoard go={goAndClose} chatOpen={chat} onToggleChat={() => setChat((c) => !c)} />
            </div>
            {chat && <DPartyChat className="w-72 pointer-events-auto" />}
          </div>
        </>
      )}
    </>
  );
}
