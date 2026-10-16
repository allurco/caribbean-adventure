import { PartyBoard } from "./PartyBoard";

/** The party board floating at the bottom left over the harbour, on desktop (#125). */
export function PartyDock() {
  return (
    <aside aria-label="Party" className="absolute bottom-6 left-6 z-10 w-56">
      <PartyBoard />
    </aside>
  );
}
