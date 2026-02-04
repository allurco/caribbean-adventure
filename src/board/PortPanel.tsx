import { useState } from "react";
import type { GoodType, ShipState, ShipClass, PortMarket, DamageCategory, PortNation } from "../game/types";
import { isBannedAtPort } from "../game/reputation";
import { MarketPanel } from "./MarketPanel";
import { ShipwrightPanel } from "./ShipwrightPanel";
import { ShipyardPanel } from "./ShipyardPanel";
import { TavernPanel } from "./TavernPanel";
import { NationFlag } from "./NationFlag";

interface PortPanelProps {
  ship: ShipState;
  market: PortMarket;
  portNation?: PortNation;
  portName?: string;
  hasShipyard?: boolean;
  onTrade: (good: GoodType, amount: number, action: "BUY" | "SELL") => void;
  onBuyUpgrade: (upgradeId: string) => void;
  onRepair: (category: DamageCategory, points: number) => void;
  onBuyShip?: (newClass: ShipClass) => void;
  onListenForRumors?: () => void;
  onAbandonMission?: () => void;
}

type Tab = "market" | "shipwright" | "shipyard" | "tavern";

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-heading flex-1 py-1.5 rounded text-[11px] font-bold cursor-pointer transition-colors uppercase tracking-wider ${
        active
          ? "bg-amber-700/70 text-amber-100 border border-amber-600/40"
          : "bg-white/5 text-amber-400/50 hover:bg-white/10 border border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

export function PortPanel({
  ship,
  market,
  portNation,
  portName,
  hasShipyard,
  onTrade,
  onBuyUpgrade,
  onRepair,
  onBuyShip,
  onListenForRumors,
  onAbandonMission,
}: PortPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("market");
  const isBanned = isBannedAtPort(ship, portNation);
  const isPiratePort = portNation === "Pirate";

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 rounded-xl overflow-hidden border border-amber-800/30 bg-gradient-to-br from-stone-900/92 via-amber-950/88 to-stone-950/92 shadow-2xl shadow-black/50 backdrop-blur-md text-white p-4 text-sm w-72">
      {/* Port Header with name and nation */}
      <div className="mb-3 pb-2 border-b border-amber-800/20">
        <div className="flex items-center gap-2">
          {portNation && <NationFlag nation={portNation} size="md" />}
          <span className={`font-heading text-sm ${isPiratePort ? "text-gray-300" : "text-amber-200"}`}>
            {portName ?? "Unknown Port"}
          </span>
        </div>
        <div className={`text-[10px] mt-0.5 ${isPiratePort ? "text-gray-500" : "text-amber-400/60"}`}>
          {isPiratePort ? "Pirate Haven" : `${portNation ?? "Unknown"} Territory`}
        </div>
      </div>

      {/* WANTED overlay when banned */}
      {isBanned ? (
        <div className="relative">
          <div className="absolute inset-0 bg-red-900/80 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center z-10 border-2 border-red-600/50">
            <div className="font-heading text-red-200 text-2xl uppercase tracking-widest mb-2">
              WANTED
            </div>
            <div className="w-12 h-12 mb-3 text-red-400">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" />
              </svg>
            </div>
            <div className="text-red-200/80 text-xs text-center px-4 leading-relaxed">
              The Governor refuses to treat with criminals like you!
            </div>
            <div className="mt-3 text-red-400/60 text-[10px] uppercase tracking-wider">
              Bounty: {ship.bounties[portNation as keyof typeof ship.bounties]} gold
            </div>
          </div>
          {/* Dimmed content behind */}
          <div className="opacity-20 pointer-events-none min-h-[200px]">
            <div className="flex gap-1 mb-3">
              <TabButton label="Market" active={activeTab === "market"} onClick={() => {}} />
              <TabButton label="Shipwright" active={activeTab === "shipwright"} onClick={() => {}} />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-1 mb-3">
            <TabButton label="Market" active={activeTab === "market"} onClick={() => setActiveTab("market")} />
            <TabButton label="Shipwright" active={activeTab === "shipwright"} onClick={() => setActiveTab("shipwright")} />
            {hasShipyard && (
              <TabButton label="Shipyard" active={activeTab === "shipyard"} onClick={() => setActiveTab("shipyard")} />
            )}
            <TabButton label="Tavern" active={activeTab === "tavern"} onClick={() => setActiveTab("tavern")} />
          </div>

          {activeTab === "market" ? (
            <MarketPanel ship={ship} market={market} onTrade={onTrade} />
          ) : activeTab === "shipwright" ? (
            <ShipwrightPanel
              ship={ship}
              onBuyUpgrade={onBuyUpgrade}
              onRepair={onRepair}
            />
          ) : activeTab === "shipyard" && onBuyShip ? (
            <ShipyardPanel ship={ship} onBuyShip={onBuyShip} />
          ) : activeTab === "tavern" && onListenForRumors && onAbandonMission ? (
            <TavernPanel
              ship={ship}
              onListenForRumors={onListenForRumors}
              onAbandonMission={onAbandonMission}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
