import { WIN_SCORE } from "../game/types";
import { HUD_GLORY_BOARD_LEFT, HUD_GLORY_BOARD_TOP, HUD_GLORY_BOARD_WIDTH } from "./hudLayout";
import type { GloryRow } from "./seat";

interface HudGloryBoardProps {
  rows: GloryRow[];
  colours: Readonly<Record<string, string>>;
}

/**
 * Every captain's glory (#110), under the sound control: glory is public, so
 * every seat sees the whole table's. Purses and holds are not on it. In an
 * online match a small dot says which seats are online (#114).
 */
export function HudGloryBoard({ rows, colours }: HudGloryBoardProps) {
  return (
    <section
      aria-label="Glory"
      className="absolute px-3 py-2 bg-black/40 rounded-lg border border-amber-700/30 backdrop-blur-sm pointer-events-none"
      style={{ top: HUD_GLORY_BOARD_TOP, left: HUD_GLORY_BOARD_LEFT, width: HUD_GLORY_BOARD_WIDTH }}
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
            <span className={`flex-1 truncate ${row.out ? "line-through opacity-60" : ""}`}>{row.name}</span>
            {row.online !== undefined && (
              <span
                role="img"
                aria-label={row.online ? "online" : "offline"}
                title={row.online ? "Online" : "Offline"}
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.online ? "bg-emerald-400" : "bg-amber-200/20"}`}
              />
            )}
            {row.out && <span className="text-[10px] uppercase tracking-wider text-amber-500/60">out</span>}
            <span className="tabular-nums">{row.glory}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
