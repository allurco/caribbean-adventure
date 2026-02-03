import { GOOD_TYPES } from "../game/types";
import type { GoodType, ShipState, PortMarket } from "../game/types";
import { canBuy, canSell } from "../game/economy";

interface MarketPanelProps {
  ship: ShipState;
  market: PortMarket;
  onTrade: (good: GoodType, amount: number, action: "BUY" | "SELL") => void;
}

export function MarketPanel({ ship, market, onTrade }: MarketPanelProps) {
  return (
    <div>
      <table className="w-full">
        <thead>
          <tr className="text-amber-500/50 text-[10px] uppercase tracking-wider">
            <th className="text-left pb-1.5 font-semibold">Good</th>
            <th className="text-right pb-1.5 font-semibold">Buy</th>
            <th className="text-right pb-1.5 font-semibold">Sell</th>
            <th className="text-right pb-1.5 font-semibold">Held</th>
            <th className="pb-1.5" />
          </tr>
        </thead>
        <tbody>
          {GOOD_TYPES.map((good) => (
            <tr key={good} className="border-t border-amber-800/15">
              <td className="py-1.5 text-amber-100 text-xs font-medium">{good}</td>
              <td className="text-right py-1.5 text-amber-200/70 text-xs tabular-nums">
                {market.prices[good].buy}g
              </td>
              <td className="text-right py-1.5 text-amber-200/70 text-xs tabular-nums">
                {market.prices[good].sell}g
              </td>
              <td className="text-right py-1.5 text-amber-100 text-xs font-semibold tabular-nums">
                {ship.cargo[good]}
              </td>
              <td className="py-1.5 pl-2 flex gap-1 justify-end">
                <button
                  disabled={!canBuy(ship, good, 1, market)}
                  onClick={() => onTrade(good, 1, "BUY")}
                  className="px-2 py-0.5 bg-emerald-800/60 hover:bg-emerald-700/70 disabled:bg-white/5 disabled:text-white/20 border border-emerald-700/30 disabled:border-transparent rounded text-[11px] font-medium cursor-pointer disabled:cursor-not-allowed transition-colors text-emerald-200"
                >
                  Buy
                </button>
                <button
                  disabled={!canSell(ship, good, 1)}
                  onClick={() => onTrade(good, 1, "SELL")}
                  className="px-2 py-0.5 bg-red-900/50 hover:bg-red-800/60 disabled:bg-white/5 disabled:text-white/20 border border-red-700/30 disabled:border-transparent rounded text-[11px] font-medium cursor-pointer disabled:cursor-not-allowed transition-colors text-red-200"
                >
                  Sell
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
