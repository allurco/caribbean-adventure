import { Html } from "@react-three/drei";
import type { PortNation, ShipState, PortMarket, GoodType } from "../game/types";
import { GOOD_TYPES } from "../game/types";
import { PRICE_RANGES } from "../game/economy";
import { isBannedAtPort } from "../game/reputation";
import { NationFlag } from "./NationFlag";

interface PortTooltipProps {
  position: [number, number, number];
  nation?: PortNation;
  portName?: string;
  hasShipyard?: boolean;
  ship: ShipState;
  market?: PortMarket;
}

// Determine if a good is "in demand" (high sell price) or "cheap" (low buy price)
function getMarketInfo(market: PortMarket): { inDemand: GoodType[]; cheap: GoodType[] } {
  const inDemand: GoodType[] = [];
  const cheap: GoodType[] = [];

  for (const good of GOOD_TYPES) {
    const price = market.prices[good];
    const range = PRICE_RANGES[good];
    const midBuy = (range.minBuy + range.maxBuy) / 2;

    // High sell price = in demand (above midpoint)
    if (price.sell > midBuy - range.spread / 2) {
      inDemand.push(good);
    }
    // Low buy price = cheap to buy (below midpoint)
    if (price.buy < midBuy) {
      cheap.push(good);
    }
  }

  return { inDemand, cheap };
}

const GOOD_COLORS: Record<GoodType, string> = {
  Wood: "#a16207",
  Sugar: "#d4d4aa",
  Rum: "#c2410c",
  Spice: "#dc2626",
};

export function PortTooltip({
  position,
  nation,
  portName,
  hasShipyard,
  ship,
  market,
}: PortTooltipProps) {
  const isBanned = isBannedAtPort(ship, nation);
  const isPiratePort = nation === "Pirate";
  const marketInfo = market ? getMarketInfo(market) : null;

  return (
    <Html position={[position[0], position[1] + 0.8, position[2]]} center>
      <div
        className={`bg-stone-900/95 text-amber-100 px-3 py-2 rounded-lg
                    text-xs shadow-lg border whitespace-nowrap pointer-events-none
                    ${isBanned ? "border-red-600/50" : "border-amber-800/30"}`}
      >
        {/* Port name */}
        <div className="flex items-center gap-2 mb-0.5">
          {nation && <NationFlag nation={nation} size="md" />}
          <span
            className={`font-heading text-sm ${
              isPiratePort ? "text-gray-300" : "text-amber-200"
            }`}
          >
            {portName ?? "Unknown Port"}
          </span>
        </div>
        {/* Nation label */}
        <div className={`text-[10px] mb-1 ${isPiratePort ? "text-gray-500" : "text-amber-400/60"}`}>
          {isPiratePort ? "Pirate Haven" : `${nation ?? "Unknown"} Territory`}
        </div>

        {/* Market demand info */}
        {marketInfo && (
          <div className="mb-1.5 pb-1.5 border-b border-amber-800/20">
            {marketInfo.inDemand.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-green-400/80">Buying:</span>
                <div className="flex gap-1">
                  {marketInfo.inDemand.map((good) => (
                    <span
                      key={good}
                      className="px-1 py-0.5 rounded text-[9px] font-medium"
                      style={{
                        backgroundColor: GOOD_COLORS[good] + "30",
                        color: GOOD_COLORS[good],
                      }}
                    >
                      {good}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {marketInfo.cheap.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                <span className="text-cyan-400/80">Selling:</span>
                <div className="flex gap-1">
                  {marketInfo.cheap.map((good) => (
                    <span
                      key={good}
                      className="px-1 py-0.5 rounded text-[9px] font-medium"
                      style={{
                        backgroundColor: GOOD_COLORS[good] + "30",
                        color: GOOD_COLORS[good],
                      }}
                    >
                      {good}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {marketInfo.inDemand.length === 0 && marketInfo.cheap.length === 0 && (
              <div className="text-amber-200/50 text-[10px]">Average prices</div>
            )}
          </div>
        )}

        {/* Features */}
        <div className="flex gap-2 text-[10px]">
          <span className="text-amber-200/60">Market</span>
          <span className="text-amber-200/60">Shipwright</span>
          {hasShipyard && <span className="text-cyan-400/80">Shipyard</span>}
        </div>

        {/* Wanted warning */}
        {isBanned && (
          <div className="mt-1.5 pt-1.5 border-t border-red-800/30">
            <div className="flex items-center gap-1.5 text-red-400">
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-semibold text-[10px] uppercase">Wanted!</span>
            </div>
            <div className="text-red-300/70 text-[10px] mt-0.5">
              Bounty: {ship.bounties[nation as keyof typeof ship.bounties]} gold
            </div>
            <div className="text-red-300/60 text-[9px] italic mt-0.5">
              Services denied
            </div>
          </div>
        )}

        {/* Pirate haven hint */}
        {isPiratePort && !isBanned && (
          <div className="mt-1.5 pt-1.5 border-t border-gray-700/30 text-gray-400/70 text-[10px] italic">
            No questions asked...
          </div>
        )}
      </div>
    </Html>
  );
}
