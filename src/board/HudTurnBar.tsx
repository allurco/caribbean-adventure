import { WIN_SCORE } from "../game/types";
import { HUD_TOP_BAR_HEIGHT } from "./hudLayout";

interface HudTurnBarProps {
  mapLabel: string;
  movesRemaining: number;
  maxMoves: number;
  gold: number;
  glory: number;
  onEndTurn: () => void;
}

export function HudTurnBar({
  mapLabel,
  movesRemaining,
  maxMoves,
  gold,
  glory,
  onEndTurn,
}: HudTurnBarProps) {
  return (
    <div className="absolute top-0 left-0 right-0 pointer-events-none">
      <div
        className="flex items-center justify-between px-5 py-2.5 bg-gradient-to-b from-black/60 via-black/30 to-transparent"
        style={{ height: HUD_TOP_BAR_HEIGHT }}
      >
        {/* Left: Map label */}
        <div className="font-heading text-amber-600/60 text-[11px] uppercase tracking-[0.2em]">
          {mapLabel}
        </div>

        {/* Center: Glory + Gold + Moves */}
        <div className="flex items-center gap-6">
          {/* Glory Counter - Prominent */}
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-900/40 rounded-lg border border-amber-700/30">
            <span className="text-amber-400 text-[10px] uppercase tracking-widest font-heading">
              Glory
            </span>
            <span className="text-amber-200 text-lg font-bold tabular-nums">
              {glory}
            </span>
            <span className="text-amber-500/60 text-sm">/ {WIN_SCORE}</span>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-amber-700/30" />

          {/* Gold */}
          <div className="flex items-center gap-1.5">
            <span className="text-yellow-500 text-sm">&#9672;</span>
            <span className="text-amber-200 text-sm font-semibold tabular-nums">
              {gold}
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-amber-700/30" />

          {/* Move pips */}
          <div className="flex items-center gap-2">
            <span className="text-amber-400/50 text-[10px] uppercase tracking-widest font-medium">
              Moves
            </span>
            <div className="flex gap-1">
              {Array.from({ length: maxMoves }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                    i < movesRemaining
                      ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                      : "bg-amber-900/40 ring-1 ring-amber-800/30"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: End Turn */}
        <div className="pointer-events-auto">
          {movesRemaining > 0 ? (
            <button
              onClick={onEndTurn}
              className="font-heading px-5 py-1.5 bg-amber-900/60 hover:bg-amber-800/80 border border-amber-700/40 hover:border-amber-600/60 text-amber-200/90 text-[11px] font-bold rounded uppercase tracking-widest cursor-pointer transition-all"
            >
              End Turn
            </button>
          ) : (
            <span className="text-amber-600/40 text-[11px] uppercase tracking-widest font-medium italic">
              Waiting...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
