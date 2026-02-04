import { useEffect, useState } from "react";
import type { Captain } from "../game/types";

interface TurnChangeAnimationProps {
  playerIndex: string;
  playerColor: string;
  captain?: Captain;
  onComplete: () => void;
}

export function TurnChangeAnimation({
  playerIndex,
  playerColor,
  captain,
  onComplete,
}: TurnChangeAnimationProps) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Phase 1: Enter animation (0.5s)
    timers.push(setTimeout(() => setPhase("hold"), 500));

    // Phase 2: Hold (1s)
    timers.push(setTimeout(() => setPhase("exit"), 1500));

    // Phase 3: Exit and complete (0.5s)
    timers.push(setTimeout(() => onComplete(), 2000));

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  const playerName = captain?.name ?? `Player ${Number(playerIndex) + 1}`;
  const nationText = captain?.nation ? `Captain of ${captain.nation}` : "";

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center overflow-hidden">
      {/* Background overlay */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          phase === "exit" ? "opacity-0" : "opacity-70"
        }`}
        style={{
          background: `linear-gradient(135deg, ${playerColor}40 0%, #00000090 50%, ${playerColor}40 100%)`,
        }}
      />

      {/* Main content */}
      <div
        className={`relative flex flex-col items-center transition-all duration-500 ${
          phase === "enter"
            ? "opacity-0 scale-110 translate-y-4"
            : phase === "exit"
            ? "opacity-0 scale-95 -translate-y-4"
            : "opacity-100 scale-100 translate-y-0"
        }`}
      >
        {/* Decorative line top */}
        <div
          className="w-64 h-0.5 mb-6 transition-all duration-700"
          style={{
            background: `linear-gradient(90deg, transparent, ${playerColor}, transparent)`,
            opacity: phase === "hold" ? 1 : 0,
          }}
        />

        {/* Turn indicator */}
        <p className="text-amber-200/60 text-lg font-heading tracking-[0.3em] uppercase mb-2">
          Your Turn
        </p>

        {/* Player name */}
        <h1
          className="text-5xl md:text-6xl font-heading font-bold tracking-wide mb-3"
          style={{
            color: playerColor,
            textShadow: `0 0 30px ${playerColor}60, 0 4px 20px rgba(0,0,0,0.5)`,
          }}
        >
          {playerName}
        </h1>

        {/* Nation */}
        {nationText && (
          <p className="text-amber-100/50 text-lg font-body tracking-wider">
            {nationText}
          </p>
        )}

        {/* Decorative line bottom */}
        <div
          className="w-64 h-0.5 mt-6 transition-all duration-700"
          style={{
            background: `linear-gradient(90deg, transparent, ${playerColor}, transparent)`,
            opacity: phase === "hold" ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}
