import type { ShipState, GoodType } from "../game/types";
import { GOOD_TYPES } from "../game/types";
import { UPGRADES } from "../game/constants";
import { totalCargo } from "../game/economy";
import { getWantedNations } from "../game/reputation";
import { NationFlag } from "./NationFlag";

interface HudShipCardProps {
  ship: ShipState;
}

function StatBar({
  label,
  current,
  max,
  barColor,
  trackColor,
}: {
  label: string;
  current: number;
  max: number;
  barColor: string;
  trackColor: string;
}) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-amber-300/60 text-[11px] w-9 text-right shrink-0 font-medium">
        {label}
      </span>
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: trackColor }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-amber-100/70 text-[11px] w-7 tabular-nums text-right shrink-0">
        {current}/{max}
      </span>
    </div>
  );
}

const CARGO_COLORS: Record<GoodType, string> = {
  Wood: "#a16207",
  Sugar: "#d4d4aa",
  Rum: "#c2410c",
  Spice: "#dc2626",
};


export function HudShipCard({ ship }: HudShipCardProps) {
  const stats = ship.stats;
  const cargoUsed = totalCargo(ship.cargo);
  const hasDamage =
    ship.damage.hull > 0 || ship.damage.crew > 0 || ship.damage.masts > 0;
  const wantedNations = getWantedNations(ship.bounties);

  return (
    <div className="flex flex-col h-full">
      {/* Section label */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading text-[11px] text-amber-500/80 uppercase tracking-widest">
          {ship.shipClass ?? "Ship"}
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-2.5">
        {/* Health bars */}
        {stats && (
          <div className="space-y-1.5">
            <StatBar
              label="Hull"
              current={stats.hull.current}
              max={stats.hull.max}
              barColor="#b45309"
              trackColor="rgba(120,53,15,0.25)"
            />
            <StatBar
              label="Crew"
              current={stats.crew.current}
              max={stats.crew.max}
              barColor="#0284c7"
              trackColor="rgba(7,89,133,0.25)"
            />
          </div>
        )}

        {/* Damage indicator */}
        {hasDamage && (
          <div className="flex items-center gap-2 bg-red-950/30 border border-red-900/30 rounded px-2 py-1">
            <span className="text-red-400/80 text-[10px] font-semibold uppercase tracking-wide">
              Damaged
            </span>
            <div className="flex gap-2">
              {ship.damage.hull > 0 && (
                <span className="text-red-300/70 text-[10px]">Hull -{ship.damage.hull}</span>
              )}
              {ship.damage.crew > 0 && (
                <span className="text-red-300/70 text-[10px]">Crew -{ship.damage.crew}</span>
              )}
              {ship.damage.masts > 0 && (
                <span className="text-red-300/70 text-[10px]">Masts -{ship.damage.masts}</span>
              )}
            </div>
          </div>
        )}

        {/* Wanted indicator */}
        {wantedNations.length > 0 && (
          <div className="flex items-center gap-2 bg-red-950/40 border border-red-800/40 rounded px-2 py-1">
            <span className="text-red-500 text-[10px] font-bold uppercase tracking-wide">
              Wanted
            </span>
            <div className="flex gap-1.5">
              {wantedNations.map((nation) => (
                <div
                  key={nation}
                  className="flex items-center gap-1"
                  title={`${nation}: ${ship.bounties[nation]} bounty`}
                >
                  <NationFlag nation={nation} size="sm" />
                  <span className="text-red-300/80 text-[10px] font-semibold">
                    {ship.bounties[nation]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stat grid */}
        {stats && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <StatItem label="Cannons" value={stats.cannons} />
            <StatItem label="Scouting" value={stats.scouting} />
            <StatItem label="Speed" value={stats.maneuverability} />
            <StatItem label="Cargo" value={`${cargoUsed}/${ship.maxCargo}`} />
          </div>
        )}

        {/* Cargo + Upgrades in a compact row */}
        {(cargoUsed > 0 || ship.upgrades.length > 0) && (
          <div className="mt-auto pt-2 border-t border-amber-700/20 flex flex-wrap gap-1">
            {GOOD_TYPES.filter((g) => ship.cargo[g] > 0).map((g) => (
              <span
                key={g}
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: CARGO_COLORS[g] + "20",
                  color: CARGO_COLORS[g],
                  border: `1px solid ${CARGO_COLORS[g]}30`,
                }}
              >
                {g} {ship.cargo[g]}
              </span>
            ))}
            {ship.upgrades.map((id) => (
              <span
                key={id}
                className="inline-flex items-center rounded bg-emerald-900/30 border border-emerald-700/25 text-emerald-400/80 px-1.5 py-0.5 text-[10px] font-medium"
              >
                {UPGRADES[id]?.name ?? id}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-amber-400/50 text-[11px]">{label}</span>
      <span className="text-amber-100 text-xs font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}
