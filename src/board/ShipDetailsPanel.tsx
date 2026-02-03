import { useState } from "react";
import type { ShipState } from "../game/types";
import { GOOD_TYPES, NATIONS, GOLD_PER_GLORY } from "../game/types";
import { isAtHomePort } from "../game/scoring";

interface ShipDetailsPanelProps {
  ship: ShipState;
  onClose: () => void;
  onStashGold?: (amount: number) => void;
}

export function ShipDetailsPanel({ ship, onClose, onStashGold }: ShipDetailsPanelProps) {
  const totalCargo = GOOD_TYPES.reduce((sum, g) => sum + ship.cargo[g], 0);
  const atHomePort = isAtHomePort(ship);
  const [stashAmount, setStashAmount] = useState(10);
  const gloryFromStash = Math.floor(stashAmount / GOLD_PER_GLORY);

  const handleStash = () => {
    if (onStashGold && stashAmount > 0 && stashAmount <= ship.gold) {
      onStashGold(stashAmount);
    }
  };

  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                    w-80 rounded-xl border border-amber-800/30
                    bg-gradient-to-br from-stone-900/95 via-amber-950/90 to-stone-950/95
                    shadow-2xl backdrop-blur-md p-4 z-50"
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-3 border-b border-amber-800/30 pb-2">
        <h2 className="font-heading text-amber-400 uppercase tracking-wider">
          {ship.shipClass ?? "Ship"} Details
        </h2>
        <button
          onClick={onClose}
          className="text-amber-400 hover:text-amber-200 cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Home Port Indicator */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-amber-400/70 text-xs uppercase">Home Port:</span>
        {atHomePort ? (
          <span className="text-green-400 text-xs font-semibold">You are here!</span>
        ) : (
          <span className="text-amber-100/50 text-xs">Not at home port</span>
        )}
      </div>

      {/* Glory & Stashed Gold */}
      <div className="mb-3 p-2 bg-amber-900/20 rounded-lg border border-amber-800/20">
        <div className="flex justify-between items-center mb-2">
          <span className="text-amber-400 text-xs uppercase font-heading">Treasury</span>
          <span className="text-amber-200 text-sm font-bold">{ship.score} Glory</span>
        </div>
        <div className="text-xs text-amber-100/70">
          Stashed: {ship.stashedGold} gold ({Math.floor(ship.stashedGold / GOLD_PER_GLORY)} VP earned)
        </div>

        {/* Stash Gold Controls - only at home port */}
        {atHomePort && onStashGold && ship.gold > 0 && (
          <div className="mt-2 pt-2 border-t border-amber-800/20">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="10"
                max={Math.max(10, Math.floor(ship.gold / 10) * 10)}
                step="10"
                value={stashAmount}
                onChange={(e) => setStashAmount(Number(e.target.value))}
                className="flex-1 h-1 bg-amber-900/50 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-amber-200 text-xs w-12 text-right">{stashAmount}g</span>
            </div>
            <button
              onClick={handleStash}
              disabled={stashAmount > ship.gold || stashAmount <= 0}
              className="mt-2 w-full py-1.5 bg-amber-700/50 hover:bg-amber-600/50
                         disabled:bg-stone-700/30 disabled:text-stone-500 disabled:cursor-not-allowed
                         text-amber-100 text-xs font-heading uppercase tracking-wider
                         rounded border border-amber-600/30 cursor-pointer transition-colors"
            >
              Stash {stashAmount} Gold (+{gloryFromStash} Glory)
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs text-amber-100/80 mb-3">
        <div>
          Hull: {ship.stats?.hull.current}/{ship.stats?.hull.max}
        </div>
        <div>
          Crew: {ship.stats?.crew.current}/{ship.stats?.crew.max}
        </div>
        <div>Cannons: {ship.stats?.cannons}</div>
        <div>Speed: {ship.stats?.maneuverability}</div>
        <div>Scouting: {ship.stats?.scouting}</div>
        <div>
          Cargo: {totalCargo}/{ship.maxCargo}
        </div>
      </div>

      {/* Cargo */}
      <div className="mb-3">
        <div className="font-heading text-amber-400/70 text-[10px] uppercase mb-1">
          Cargo Hold
        </div>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {GOOD_TYPES.map((good) => (
            <div
              key={good}
              className={
                ship.cargo[good] > 0 ? "text-amber-100" : "text-amber-100/40"
              }
            >
              {good}: {ship.cargo[good]}
            </div>
          ))}
        </div>
      </div>

      {/* Upgrades */}
      {ship.upgrades.length > 0 && (
        <div className="mb-3">
          <div className="font-heading text-amber-400/70 text-[10px] uppercase mb-1">
            Upgrades
          </div>
          <div className="flex flex-wrap gap-1">
            {ship.upgrades.map((u) => (
              <span
                key={u}
                className="bg-amber-800/30 text-amber-200 px-2 py-0.5 rounded text-[10px]"
              >
                {u.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bounties */}
      <div>
        <div className="font-heading text-amber-400/70 text-[10px] uppercase mb-1">
          Bounties
        </div>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {NATIONS.map((nation) => (
            <div
              key={nation}
              className={
                ship.bounties[nation] > 0 ? "text-red-400" : "text-amber-100/40"
              }
            >
              {nation}: {ship.bounties[nation]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
