import type { EventCardFace } from "./eventCardView";

/**
 * The event log (#246): the last few events drawn, newest first, so a
 * player sees what happened on other players' turns. Under the glory board
 * in the HUD's left column (`Board`).
 */
export function HudEventLog({ rows }: { rows: readonly EventCardFace[] }) {
  if (rows.length === 0) return null;
  return (
    <section
      aria-label="Events"
      className="px-3 py-2 bg-black/40 rounded-lg border border-amber-700/30 backdrop-blur-sm pointer-events-none"
    >
      <h2 className="font-heading text-amber-400 text-[10px] uppercase tracking-widest mb-1">Events</h2>
      <ol className="space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="text-xs text-amber-200/80 leading-snug">
            <span className="text-amber-100 font-semibold">{row.title}</span>
            {row.region && <span className="text-amber-200/60"> · {row.region}</span>}
            {row.after && <span className="block text-[10px] text-amber-200/50">after {row.after}’s turn</span>}
            <span className="block text-amber-200/70">{row.effect}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
