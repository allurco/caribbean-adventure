import type { DraftSeat } from "./seat";

/** Every other seat in the draft, picked or still choosing (#111); nothing in hotseat or solo. */
export function DraftSeats({ others }: { others?: DraftSeat[] }) {
  if (!others || others.length === 0) return null;
  return (
    <ul className="mt-8 flex flex-wrap justify-center gap-3" aria-label="Other captains">
      {others.map((other) => (
        <li
          key={other.seat}
          className="rounded-lg border border-amber-700/30 bg-stone-900/70 px-4 py-2 text-center text-sm"
        >
          <div className="font-heading text-amber-100/80">{other.name}</div>
          <div className={`text-xs italic ${other.picked ? "text-emerald-300/70" : "text-amber-400/50"}`}>
            {other.picked ? "Picked" : "Still choosing"}
          </div>
        </li>
      ))}
    </ul>
  );
}
