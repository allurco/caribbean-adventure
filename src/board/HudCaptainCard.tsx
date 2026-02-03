import type { Captain, Nation } from "../game/types";

interface HudCaptainCardProps {
  captain?: Captain;
  playerIndex: string;
  playerColor: string;
}

const NATION_COLORS: Record<Nation, string> = {
  England: "#dc2626",
  France: "#2563eb",
  Spain: "#ca8a04",
  Netherlands: "#ea580c",
};

export function HudCaptainCard({
  captain,
  playerIndex,
  playerColor,
}: HudCaptainCardProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Section label */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-2.5 h-2.5 rounded-sm"
          style={{ backgroundColor: playerColor }}
        />
        <span className="font-heading text-[11px] text-amber-500/80 uppercase tracking-widest">
          Captain — P{playerIndex}
        </span>
      </div>

      {captain ? (
        <div className="flex-1 flex flex-col">
          <div className="font-heading text-amber-100 text-sm font-bold leading-tight mb-1">
            {captain.name}
          </div>

          <div className="flex items-center gap-1.5 mb-2.5">
            <span
              className="inline-block w-2 h-2 rounded-full ring-1 ring-white/10"
              style={{ backgroundColor: NATION_COLORS[captain.nation] }}
            />
            <span className="text-amber-300/70 text-[11px] font-medium">
              {captain.nation}
            </span>
          </div>

          <div className="mt-auto pt-2 border-t border-amber-700/20">
            <div className="text-[10px] text-amber-500/50 uppercase tracking-wider mb-0.5 font-semibold">
              Ability
            </div>
            <div className="text-amber-200/60 text-[11px] italic leading-snug">
              {captain.ability}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-amber-700/40 text-xs italic">No captain assigned</span>
        </div>
      )}
    </div>
  );
}
