import type { Captain } from "../game/types";
import { NationFlag } from "./NationFlag";

interface HudCaptainCardProps {
  captain?: Captain;
  playerIndex: string;
  playerColor: string;
}

/** The captain's half of the parchment sheet (`HudParchmentPanel`), in ink. */
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
          aria-hidden="true"
          className="w-2.5 h-2.5 rounded-sm ring-1 ring-ink/40"
          style={{ backgroundColor: playerColor }}
        />
        <h2 className="font-heading text-[11px] font-bold text-ink-faded uppercase tracking-widest">
          Captain — P{Number(playerIndex) + 1}
        </h2>
      </div>

      {captain ? (
        <div className="flex-1 flex flex-col">
          <div className="font-heading text-ink text-sm font-bold leading-tight mb-1">
            {captain.name}
          </div>

          <div className="flex items-center gap-1.5 mb-2.5">
            <NationFlag nation={captain.nation} size="sm" />
            <span className="text-ink-faded text-[11px] font-medium">
              {captain.nation}
            </span>
          </div>

          <div className="mt-auto pt-2 border-t border-ink/25">
            <div className="text-[11px] text-ink-faded uppercase tracking-wider mb-0.5 font-semibold">
              Ability
            </div>
            <div className="text-ink text-[11px] italic leading-snug">
              {captain.ability}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-ink-faded text-xs italic">No captain assigned</span>
        </div>
      )}
    </div>
  );
}
