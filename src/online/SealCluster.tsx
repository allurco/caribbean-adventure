import { useEffect, useState } from "react";
import type { Profile } from "./accountService";
import { CaptainSeal } from "./CaptainSeal";
import { PartyBoard } from "./PartyBoard";
import { BOARD_H, FOCUS_RING } from "./shellStyles";

/**
 * The party on a phone held sideways (#125): the crew's seals on a timber tab
 * in the top right corner (for now only the captain's own, until parties
 * #119), opening the party board as an overlay beneath it. Escape or a tap
 * outside closes it.
 */
export function SealCluster({ captain }: { captain: Profile }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="shell-party-overlay"
        aria-label={open ? "Close the party board" : "Open the party board"}
        className={`${BOARD_H} ${FOCUS_RING} absolute top-2.5 right-[max(12px,env(safe-area-inset-right))] z-40 flex h-12 min-w-12 cursor-pointer items-center justify-center rounded-full! px-1.5 active:translate-y-[2px]`}
      >
        <CaptainSeal id={captain.id} displayName={captain.displayName} avatarUrl={captain.avatarUrl} size="sm" />
      </button>

      {open && (
        <>
          <div aria-hidden="true" onClick={() => setOpen(false)} className="absolute inset-0 z-20 bg-shell-scrim/45" />
          <div
            id="shell-party-overlay"
            role="dialog"
            aria-label="Party"
            className="absolute top-16 right-[max(12px,env(safe-area-inset-right))] z-30 w-56"
          >
            <PartyBoard onNavigate={() => setOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}
