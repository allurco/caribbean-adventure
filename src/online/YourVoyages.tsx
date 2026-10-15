import type { RoomApi } from "./roomApi";
import { BTN_INK, BTN_WAX } from "./shellStyles";
import { useVoyages } from "./useVoyages";
import { harbourVoyages } from "./voyageList";

/**
 * "Your voyages" (#301), after the online shell's Play screen (#125): the
 * match waiting on the player leads with a wax-red Take your turn, then
 * "Your other voyages", each with Open, Lobby or View. Self-contained, so
 * #125's Play sheet can host it as it is.
 */
export function YourVoyages({ api }: { api: Pick<RoomApi, "listVoyages"> }) {
  const state = useVoyages(api);
  if (state.status === "loading") return <p role="status">Reading the ship's log…</p>;
  if (state.status === "error") {
    return (
      <p role="alert" className="text-shell-ink-wax">
        {state.error}
      </p>
    );
  }
  const { lead, others } = harbourVoyages(state.voyages);
  const listTitle = lead ? "Your other voyages" : "Your voyages";
  return (
    <div className="space-y-5">
      {lead && (
        <section
          aria-labelledby="lead-voyage-name"
          className="flex flex-col gap-4 border-b-2 border-double border-shell-ink-soft/50 pb-5 sm:flex-row sm:items-center sm:gap-6"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[15px] italic text-shell-ink-wax">It is your turn</p>
            <h2 id="lead-voyage-name" className="font-fell text-[26px] leading-tight">
              {lead.name}
            </h2>
            <p className="text-[15px] text-shell-ink-soft [font-variant-numeric:lining-nums]">{lead.line}</p>
          </div>
          <a href={lead.link.href} className={`${BTN_WAX} w-full sm:w-auto`}>
            {lead.link.label}
          </a>
        </section>
      )}

      <section aria-labelledby="other-voyages-title">
        <h3 id="other-voyages-title" className="mb-1 font-fell text-[19px] italic text-shell-ink-soft">
          {listTitle}
        </h3>
        {others.length === 0 ? (
          <p className="text-[15px] text-shell-ink-soft">
            {lead ? "None besides this one." : "No voyages yet. Open a room below and invite your friends."}
          </p>
        ) : (
          <ul aria-label={listTitle}>
            {others.map((voyage) => (
              <li key={voyage.roomId} className="flex items-center gap-3 border-t border-shell-ink-soft/30 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-fell text-[19px]">{voyage.name}</div>
                  <div
                    className={`text-[14px] [font-variant-numeric:lining-nums] ${voyage.yourTurn ? "text-shell-ink-wax" : "text-shell-ink-soft"}`}
                  >
                    {voyage.line}
                  </div>
                </div>
                <a href={voyage.link.href} className={`${BTN_INK} shrink-0`}>
                  {voyage.link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
