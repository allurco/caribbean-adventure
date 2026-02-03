import type { ShipState, DamageCategory } from "../game/types";
import { UPGRADES, REPAIR_COST_PER_POINT } from "../game/constants";
import { canBuyUpgrade, canRepair } from "../game/economy";

interface ShipwrightPanelProps {
  ship: ShipState;
  onBuyUpgrade: (upgradeId: string) => void;
  onRepair: (category: DamageCategory, points: number) => void;
}

const DAMAGE_CATEGORIES: DamageCategory[] = ["hull", "crew", "masts"];

export function ShipwrightPanel({
  ship,
  onBuyUpgrade,
  onRepair,
}: ShipwrightPanelProps) {
  return (
    <div>
      {/* Repairs */}
      <div className="mb-4">
        <h3 className="text-amber-500/50 text-[10px] uppercase tracking-wider font-semibold mb-2">
          Repairs ({REPAIR_COST_PER_POINT}g each)
        </h3>
        <div className="space-y-1.5">
          {DAMAGE_CATEGORIES.map((cat) => (
            <div key={cat} className="flex items-center justify-between">
              <span className="text-amber-100 text-xs font-medium capitalize">
                {cat}
                <span className="text-amber-400/50 ml-1.5 tabular-nums">
                  {ship.damage[cat] > 0 ? `${ship.damage[cat]} dmg` : "OK"}
                </span>
              </span>
              <button
                disabled={!canRepair(ship, cat)}
                onClick={() => onRepair(cat, 1)}
                className="px-2.5 py-0.5 bg-amber-800/50 hover:bg-amber-700/60 disabled:bg-white/5 disabled:text-white/20 border border-amber-700/30 disabled:border-transparent rounded text-[11px] font-medium cursor-pointer disabled:cursor-not-allowed transition-colors text-amber-200"
              >
                Repair
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Upgrades */}
      <div>
        <h3 className="text-amber-500/50 text-[10px] uppercase tracking-wider font-semibold mb-2">
          Upgrades
        </h3>
        <div className="space-y-2">
          {Object.values(UPGRADES).map((upgrade) => {
            const owned = ship.upgrades.includes(upgrade.id);
            return (
              <div key={upgrade.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-amber-100 truncate">
                    {upgrade.name}
                  </div>
                  <div className="text-[10px] text-amber-400/40 truncate leading-tight">
                    {upgrade.description}
                  </div>
                </div>
                {owned ? (
                  <span className="text-emerald-400/70 text-[10px] font-semibold uppercase tracking-wide shrink-0">
                    Installed
                  </span>
                ) : (
                  <button
                    disabled={!canBuyUpgrade(ship, upgrade.id)}
                    onClick={() => onBuyUpgrade(upgrade.id)}
                    className="px-2.5 py-0.5 bg-amber-800/50 hover:bg-amber-700/60 disabled:bg-white/5 disabled:text-white/20 border border-amber-700/30 disabled:border-transparent rounded text-[11px] font-medium cursor-pointer disabled:cursor-not-allowed transition-colors text-amber-200 shrink-0 tabular-nums"
                  >
                    {upgrade.cost}g
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
