import { useEffect, useState } from "react";
import type { MissionReward } from "../game/types";

interface MissionCompleteToastProps {
  title: string;
  reward: MissionReward;
  onComplete: () => void;
}

export function MissionCompleteToast({
  title,
  reward,
  onComplete,
}: MissionCompleteToastProps) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    timers.push(setTimeout(() => setPhase("hold"), 300));
    timers.push(setTimeout(() => setPhase("exit"), 2500));
    timers.push(setTimeout(() => onComplete(), 3000));

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div
      className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        phase === "enter"
          ? "opacity-0 -translate-y-4"
          : phase === "exit"
          ? "opacity-0 translate-y-4"
          : "opacity-100 translate-y-0"
      }`}
    >
      <div className="bg-gradient-to-r from-emerald-900/95 via-emerald-800/95 to-emerald-900/95 border border-emerald-500/50 rounded-xl px-6 py-4 shadow-2xl shadow-emerald-900/50">
        <div className="flex items-center gap-4">
          <div className="text-3xl">🎉</div>
          <div>
            <div className="text-emerald-300 text-xs uppercase tracking-widest mb-1">
              Mission Complete!
            </div>
            <div className="text-white font-heading text-lg">{title}</div>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-yellow-400 text-sm font-bold">
                +{reward.gold} Gold
              </span>
              <span className="text-purple-400 text-sm font-bold">
                +{reward.glory} Glory
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
