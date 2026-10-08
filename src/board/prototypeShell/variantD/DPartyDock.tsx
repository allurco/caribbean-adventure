import { useState } from "react";
import type { Screen } from "../shellKeys";
import { DPartyBoard, DPartyChat } from "./DPartyBoard";
import { GARAMOND } from "./theme";

/**
 * THROWAWAY PROTOTYPE: variant D's party dock (tablet and up), a compact
 * board floating at the bottom left over the harbour: who is in the party
 * and where they are. The chat stays folded behind a button and opens as a
 * slate over the scene, not as a permanent column.
 */
export function DPartyDock({ go }: { go: (s: Screen) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <aside aria-label="Party" className={`${GARAMOND} hidden md:block absolute left-6 bottom-6 z-10 w-56`}>
      {open && <DPartyChat className="absolute bottom-full left-0 mb-3 w-80" />}
      <DPartyBoard go={go} chatOpen={open} onToggleChat={() => setOpen((o) => !o)} />
    </aside>
  );
}
