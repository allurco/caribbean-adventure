import type { ShipState, Mission, MissionType } from "../game/types";
import { getTavernCost, canAffordTavern } from "../game/missions";

interface TavernPanelProps {
  ship: ShipState;
  onListenForRumors: () => void;
  onAbandonMission: () => void;
}

const MISSION_TYPE_ICONS: Record<MissionType, string> = {
  DELIVERY: "📦",
  ASSASSINATION: "💀",
  ESCORT: "🛡️",
};

const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  DELIVERY: "Delivery",
  ASSASSINATION: "Bounty Hunt",
  ESCORT: "Safe Passage",
};

function MissionCard({ mission }: { mission: Mission }) {
  const isFailed = mission.type === "ESCORT" && mission.noDamageTaken === false;

  return (
    <div className={`rounded-lg border p-3 ${
      isFailed
        ? "bg-red-900/30 border-red-700/50"
        : "bg-amber-900/30 border-amber-700/50"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{MISSION_TYPE_ICONS[mission.type]}</span>
        <div className="flex-1">
          <div className="font-heading text-amber-100 text-sm">{mission.title}</div>
          <div className="text-amber-400/60 text-[10px] uppercase tracking-wider">
            {MISSION_TYPE_LABELS[mission.type]}
          </div>
        </div>
      </div>

      <p className="text-amber-200/70 text-xs leading-relaxed mb-3">
        {mission.description}
      </p>

      {isFailed && (
        <div className="text-red-400 text-xs mb-2 flex items-center gap-1">
          <span>⚠️</span>
          <span>Mission failed - you took damage!</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-amber-700/30">
        <span className="text-amber-400/60 text-[10px] uppercase tracking-wider">Reward</span>
        <div className="flex items-center gap-3">
          <span className="text-yellow-400 text-xs font-bold">
            {mission.reward.gold}g
          </span>
          <span className="text-purple-400 text-xs font-bold">
            {mission.reward.glory} Glory
          </span>
        </div>
      </div>
    </div>
  );
}

export function TavernPanel({
  ship,
  onListenForRumors,
  onAbandonMission,
}: TavernPanelProps) {
  const tavernCost = getTavernCost();
  const canAfford = canAffordTavern(ship.gold);
  const hasActiveMission = !!ship.activeMission;
  const missionFailed = ship.activeMission?.type === "ESCORT" &&
    ship.activeMission.noDamageTaken === false;

  return (
    <div className="space-y-3">
      {/* Tavern atmosphere */}
      <div className="text-center py-2">
        <div className="text-2xl mb-1">🍺</div>
        <p className="text-amber-200/60 text-xs italic">
          "Drink up, sailor... and keep yer ears open for opportunity."
        </p>
      </div>

      {/* Active mission display */}
      {hasActiveMission && ship.activeMission && (
        <div className="space-y-2">
          <div className="text-amber-400/80 text-[10px] uppercase tracking-wider">
            Active Contract
          </div>
          <MissionCard mission={ship.activeMission} />

          {/* Abandon mission button */}
          <button
            onClick={onAbandonMission}
            className="w-full py-1.5 rounded text-[11px] font-bold cursor-pointer transition-colors uppercase tracking-wider bg-red-900/50 text-red-300 hover:bg-red-800/50 border border-red-700/50"
          >
            {missionFailed ? "Clear Failed Mission" : "Abandon Mission"}
          </button>
        </div>
      )}

      {/* Listen for rumors button */}
      {!hasActiveMission && (
        <div className="space-y-2">
          <div className="text-amber-200/60 text-xs text-center">
            Pay the barkeep for information about lucrative opportunities...
          </div>

          <button
            onClick={onListenForRumors}
            disabled={!canAfford}
            className={`w-full py-2.5 rounded text-xs font-bold cursor-pointer transition-colors uppercase tracking-wider ${
              canAfford
                ? "bg-amber-700/70 text-amber-100 hover:bg-amber-600/70 border border-amber-600/40"
                : "bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-600/30"
            }`}
          >
            Listen for Rumors ({tavernCost}g)
          </button>

          {!canAfford && (
            <div className="text-red-400/70 text-[10px] text-center">
              Not enough gold
            </div>
          )}
        </div>
      )}

      {/* Hints */}
      <div className="mt-4 pt-3 border-t border-amber-800/20">
        <div className="text-amber-400/40 text-[10px] space-y-1">
          <p>📦 <span className="text-amber-300/50">Delivery</span> - Transport cargo to distant ports</p>
          <p>💀 <span className="text-amber-300/50">Bounty</span> - Hunt and sink marked ships</p>
          <p>🛡️ <span className="text-amber-300/50">Escort</span> - Travel without taking damage</p>
        </div>
      </div>
    </div>
  );
}
