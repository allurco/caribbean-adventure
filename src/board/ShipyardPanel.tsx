import type { ShipState, ShipClass } from "../game/types";
import { SHIP_CLASSES } from "../game/types";
import { SHIP_SPECS } from "../game/constants";
import { canBuyShip, getShipBuyCost } from "../game/economy";

interface ShipyardPanelProps {
  ship: ShipState;
  onBuyShip: (newClass: ShipClass) => void;
}

function StatCompare({
  label,
  current,
  next,
}: {
  label: string;
  current: number;
  next: number;
}) {
  const diff = next - current;
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-amber-300/50 text-[10px]">{label}</span>
      <span className="text-xs tabular-nums">
        <span className="text-amber-100/60">{current}</span>
        <span className="text-amber-600/40 mx-0.5">&rarr;</span>
        <span
          className={
            diff > 0
              ? "text-emerald-400"
              : diff < 0
                ? "text-red-400"
                : "text-amber-100/80"
          }
        >
          {next}
        </span>
      </span>
    </div>
  );
}

export function ShipyardPanel({ ship, onBuyShip }: ShipyardPanelProps) {
  const currentStats = ship.stats;
  const currentClass = ship.shipClass;

  return (
    <div>
      <h3 className="text-amber-500/50 text-[10px] uppercase tracking-wider font-semibold mb-2">
        Ships for Sale
      </h3>
      <div className="space-y-3">
        {SHIP_CLASSES.filter((cls) => cls !== currentClass).map((cls) => {
          const specs = SHIP_SPECS[cls];
          const netCost = getShipBuyCost(currentClass, cls);
          const affordable = canBuyShip(ship, cls);

          return (
            <div
              key={cls}
              className="rounded-lg border border-amber-800/20 bg-white/5 p-2.5"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-100">
                  {cls}
                </span>
                <span className="text-[10px] text-amber-400/60 tabular-nums">
                  {netCost > 0 ? `${netCost}g` : netCost === 0 ? "Even trade" : `+${Math.abs(netCost)}g`}
                </span>
              </div>

              {currentStats && (
                <div className="space-y-0.5 mb-2">
                  <StatCompare
                    label="Speed"
                    current={currentStats.maneuverability}
                    next={specs.maneuverability}
                  />
                  <StatCompare
                    label="Cargo"
                    current={currentStats.cargo}
                    next={specs.cargo}
                  />
                  <StatCompare
                    label="Cannons"
                    current={currentStats.cannons}
                    next={specs.cannons}
                  />
                  <StatCompare
                    label="Hull"
                    current={currentStats.hull.max}
                    next={specs.hull.max}
                  />
                  <StatCompare
                    label="Crew"
                    current={currentStats.crew.max}
                    next={specs.crew.max}
                  />
                  <StatCompare
                    label="Scouting"
                    current={currentStats.scouting}
                    next={specs.scouting}
                  />
                </div>
              )}

              <button
                disabled={!affordable}
                onClick={() => onBuyShip(cls)}
                className="w-full py-1 bg-amber-800/50 hover:bg-amber-700/60 disabled:bg-white/5 disabled:text-white/20 border border-amber-700/30 disabled:border-transparent rounded text-[11px] font-medium cursor-pointer disabled:cursor-not-allowed transition-colors text-amber-200"
              >
                {affordable
                  ? netCost > 0
                    ? `Buy for ${netCost}g`
                    : netCost === 0
                      ? "Trade Even"
                      : `Trade (+${Math.abs(netCost)}g)`
                  : "Can't Buy"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
