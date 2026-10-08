import { useState } from "react";
import { PUBLIC_ROOMS } from "../../fixtures";
import type { VariantProps } from "../../shellKeys";
import { DSegmented } from "../DSegmented";
import { BTN_BRASS, BTN_INK, FELL, GARAMOND, INK_SOFT, RULE } from "../theme";

const FILTERS = ["All", "Async", "Live"] as const;

/** THROWAWAY PROTOTYPE: variant D, the lobby as a harbour ledger of public rooms. */
export function DLobby({ go }: VariantProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const rooms = PUBLIC_ROOMS.filter((r) => filter === "All" || (filter === "Live") === r.timer.includes("live"));
  return (
    <div className={GARAMOND}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="w-full sm:w-64">
          <DSegmented label="Turn timer" options={FILTERS} value={filter} onPick={setFilter} />
        </div>
        <button onClick={() => go("room")} className={`${BTN_BRASS} w-full sm:w-auto`}>
          Create a room
        </button>
      </div>
      <div className={`hidden md:grid grid-cols-[2fr_1.4fr_0.8fr_1fr_1fr_80px] gap-3 px-1 pb-1 border-b-2 border-double ${RULE} ${FELL} italic text-[16px] text-[#4a3220]`}>
        <span>Room</span>
        <span>Host</span>
        <span>Map</span>
        <span>Turns</span>
        <span>Seats</span>
        <span />
      </div>
      <ul>
        {rooms.map((r) => (
          <li key={r.id} className={`grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1.4fr_0.8fr_1fr_1fr_80px] gap-x-3 items-center px-1 py-3 border-b ${RULE}`}>
            <div className="min-w-0">
              <div className={`${FELL} text-[19px] text-[#2b1d10] leading-tight`}>{r.name}</div>
              <div className={`md:hidden text-[14px] ${INK_SOFT} lining-nums`}>
                {r.host}, {r.mapSize.toLowerCase()} map, {r.timer}. {r.seats - r.filled} of {r.seats} seats free.
              </div>
            </div>
            <span className={`hidden md:block text-[15px] ${INK_SOFT} lining-nums`}>
              {r.host} <span className="italic opacity-75">{r.hostRating}</span>
            </span>
            <span className={`hidden md:block text-[15px] ${INK_SOFT}`}>{r.mapSize}</span>
            <span className={`hidden md:block text-[15px] ${r.timer.includes("live") ? "text-[#1e5a6b] font-semibold" : INK_SOFT}`}>{r.timer}</span>
            <span className="hidden md:flex gap-1" aria-label={`${r.filled} of ${r.seats} seats taken`}>
              {Array.from({ length: r.seats }).map((_, k) => (
                <span key={k} className={`w-3 h-3 rounded-full border border-[#3a2817] ${k < r.filled ? "bg-[#3a2817]" : ""}`} />
              ))}
            </span>
            <button onClick={() => go("room")} className={BTN_INK}>
              Join
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
