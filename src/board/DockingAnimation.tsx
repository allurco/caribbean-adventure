import { useEffect, useState } from "react";
import type { PortMarket, GoodType, PortNation } from "../game/types";

interface DockingAnimationProps {
  portName: string;
  nation?: PortNation;
  market?: PortMarket;
  onComplete: () => void;
}

const NATION_COLORS: Record<PortNation, string> = {
  England: "#c41e3a",
  France: "#0055a4",
  Spain: "#f1bf00",
  Netherlands: "#ff6600",
  Pirate: "#1a1a1a",
};

const GOOD_ICONS: Record<GoodType, string> = {
  Wood: "🪵",
  Sugar: "🍬",
  Rum: "🍾",
  Spice: "🌶️",
};

// Get the in-demand good for this port
function getInDemandGood(market: PortMarket): { good: GoodType; sellPrice: number } | null {
  if (!market.inDemandGood) return null;
  return {
    good: market.inDemandGood,
    sellPrice: market.prices[market.inDemandGood].sell,
  };
}

export function DockingAnimation({
  portName,
  nation,
  market,
  onComplete,
}: DockingAnimationProps) {
  const [phase, setPhase] = useState<"zoom" | "goods" | "fade">("zoom");

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Phase 1: Zoom in (1s)
    timers.push(setTimeout(() => setPhase("goods"), 1000));

    // Phase 2: Show goods (2s)
    timers.push(setTimeout(() => setPhase("fade"), 3000));

    // Phase 3: Fade out and complete (0.5s)
    timers.push(setTimeout(() => onComplete(), 3500));

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  const nationColor = nation ? NATION_COLORS[nation] : "#666";
  const inDemandGood = market ? getInDemandGood(market) : null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center overflow-hidden">
      {/* Background overlay */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          phase === "fade" ? "opacity-0" : "opacity-60"
        }`}
        style={{ background: `radial-gradient(circle, ${nationColor}40 0%, #00000080 100%)` }}
      />

      {/* Main content container */}
      <div
        className={`relative flex flex-col items-center transition-all duration-500 ${
          phase === "fade" ? "opacity-0 scale-95" : "opacity-100 scale-100"
        }`}
      >
        {/* Welcome text */}
        <div
          className={`text-center transition-all duration-1000 ease-out ${
            phase === "zoom"
              ? "animate-[zoomIn_1s_ease-out_forwards]"
              : ""
          }`}
        >
          <p className="text-amber-200/80 text-2xl font-heading tracking-widest uppercase mb-2">
            Welcome to
          </p>
          <h1
            className="text-6xl md:text-8xl font-heading font-bold tracking-wide drop-shadow-2xl"
            style={{ color: nationColor, textShadow: `0 0 40px ${nationColor}80` }}
          >
            {portName}
          </h1>
          {nation && nation !== "Pirate" && (
            <p className="text-amber-100/70 text-xl mt-3 font-body tracking-wider">
              A port of {nation}
            </p>
          )}
          {nation === "Pirate" && (
            <p className="text-amber-100/70 text-xl mt-3 font-body tracking-wider">
              A Pirate Haven
            </p>
          )}
        </div>

        {/* Governor's Request - appears after zoom */}
        <div
          className={`mt-12 transition-all duration-700 ${
            phase === "zoom"
              ? "opacity-0 translate-y-8"
              : "opacity-100 translate-y-0"
          }`}
        >
          {inDemandGood && (
            <>
              <p className="text-amber-200/60 text-lg text-center mb-4 font-heading uppercase tracking-widest">
                {nation === "Pirate" ? "Pirate's Desire" : "Governor's Request"}
              </p>
              <div className="flex flex-col items-center bg-stone-900/80 px-8 py-5 rounded-xl border border-amber-700/30">
                <span className="text-5xl mb-2">{GOOD_ICONS[inDemandGood.good]}</span>
                <span className="text-amber-100 font-heading text-xl">{inDemandGood.good}</span>
                <span className="text-emerald-400 font-bold text-sm mt-1">
                  Sells for: {inDemandGood.sellPrice}g
                </span>
                <span className="text-yellow-400/80 text-xs mt-2 font-heading tracking-wide">
                  Sell 3+ for +1 Glory!
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CSS for zoom animation */}
      <style>{`
        @keyframes zoomIn {
          0% {
            transform: scale(0.3);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
