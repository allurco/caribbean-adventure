import { useState } from "react";
import type { GoodType, ShipState, PortMarket, DamageCategory } from "../game/types";
import { MarketPanel } from "./MarketPanel";
import { ShipwrightPanel } from "./ShipwrightPanel";

interface PortPanelProps {
  ship: ShipState;
  market: PortMarket;
  onTrade: (good: GoodType, amount: number, action: "BUY" | "SELL") => void;
  onBuyUpgrade: (upgradeId: string) => void;
  onRepair: (category: DamageCategory, points: number) => void;
}

type Tab = "market" | "shipwright";

export function PortPanel({
  ship,
  market,
  onTrade,
  onBuyUpgrade,
  onRepair,
}: PortPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("market");

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 rounded-xl overflow-hidden border border-amber-800/30 bg-gradient-to-br from-stone-900/92 via-amber-950/88 to-stone-950/92 shadow-2xl shadow-black/50 backdrop-blur-md text-white p-4 text-sm w-72">
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setActiveTab("market")}
          className={`font-heading flex-1 py-1.5 rounded text-[11px] font-bold cursor-pointer transition-colors uppercase tracking-wider ${
            activeTab === "market"
              ? "bg-amber-700/70 text-amber-100 border border-amber-600/40"
              : "bg-white/5 text-amber-400/50 hover:bg-white/10 border border-transparent"
          }`}
        >
          Market
        </button>
        <button
          onClick={() => setActiveTab("shipwright")}
          className={`font-heading flex-1 py-1.5 rounded text-[11px] font-bold cursor-pointer transition-colors uppercase tracking-wider ${
            activeTab === "shipwright"
              ? "bg-amber-700/70 text-amber-100 border border-amber-600/40"
              : "bg-white/5 text-amber-400/50 hover:bg-white/10 border border-transparent"
          }`}
        >
          Shipwright
        </button>
      </div>

      {activeTab === "market" ? (
        <MarketPanel ship={ship} market={market} onTrade={onTrade} />
      ) : (
        <ShipwrightPanel
          ship={ship}
          onBuyUpgrade={onBuyUpgrade}
          onRepair={onRepair}
        />
      )}
    </div>
  );
}
