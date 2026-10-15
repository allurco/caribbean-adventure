import { WIN_SCORE } from "../game/types";
import type { GloryRow } from "./seat";

interface HudGloryBoardProps {
  rows: GloryRow[];
  colours: Readonly<Record<string, string>>;
}

/**
 * Every captain's glory (#110), under the sound control: glory is public, so
 * every seat sees the whole table's. Purses and holds are not on it.
 */
export function HudGloryBoard({ rows, colours }: HudGloryBoardProps) {
  return (
    <section
      aria-label="Glory"
      className="absolute top-24 left-5 w-52 px-3 py-2 bg-black/40 rounded-lg border border-amber-700/30 backdrop-blur-sm pointer-events-none"
    >
      <h2 className="font-heading text-amber-400 text-[10px] uppercase tracking-widest mb-1">
        Glory <span className="text-amber-500/60 normal-case tracking-normal">to {WIN_SCORE}</span>
      </h2>
      <ol className="space-y-0.5">
        {rows.map((row) => (
          <li
            key={row.seat}
            aria-current={row.viewer ? "true" : undefined}
            className={`flex items-center gap-2 text-xs ${row.viewer ? "text-amber-100 font-semibold" : "text-amber-200/70"}`}
          >
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-sm shrink-0 ring-1 ring-black/40"
              style={{ backgroundColor: colours[row.seat] ?? "#888888" }}
            />
            <span className="flex-1 truncate">{row.name}</span>
            <span className="tabular-nums">{row.glory}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
