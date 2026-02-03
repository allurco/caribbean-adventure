import type { CombatState, ShipState, CombatAction, NPCShip } from "../game/types";

interface CombatPanelProps {
  combat: CombatState;
  ships: Record<string, ShipState>;
  npcs: Record<string, NPCShip>;
  onRollSeamanship: () => void;
  onChooseAction: (action: CombatAction) => void;
  onRollFleeAttempt: () => void;
  onRollCannons: () => void;
  onApplyResolution: () => void;
}

function ShipCombatStats({ ship, label }: { ship: ShipState; label: string }) {
  return (
    <div className="bg-black/20 rounded p-2 text-xs">
      <div className="font-heading text-amber-400 uppercase text-[10px] tracking-wider mb-1">
        {label}
      </div>
      <div className="space-y-0.5 text-amber-100/80">
        <div>
          Hull: {ship.stats?.hull.current ?? 0}/{ship.stats?.hull.max ?? 0}
        </div>
        <div>
          Crew: {ship.stats?.crew.current ?? 0}/{ship.stats?.crew.max ?? 0}
        </div>
        <div>Cannons: {ship.stats?.cannons ?? 0}</div>
        <div>Maneuverability: {ship.stats?.maneuverability ?? 0}</div>
      </div>
    </div>
  );
}

function NPCCombatStats({ npc, label }: { npc: NPCShip; label: string }) {
  return (
    <div className="bg-black/20 rounded p-2 text-xs">
      <div className="font-heading text-amber-400 uppercase text-[10px] tracking-wider mb-1">
        {label}
      </div>
      <div className="text-[10px] text-amber-300/60 mb-1">
        {npc.nation} {npc.shipClass}
      </div>
      <div className="space-y-0.5 text-amber-100/80">
        <div>
          Hull: {npc.stats.hull.current}/{npc.stats.hull.max}
        </div>
        <div>
          Crew: {npc.stats.crew.current}/{npc.stats.crew.max}
        </div>
        <div>Cannons: {npc.stats.cannons}</div>
        <div>Maneuverability: {npc.stats.maneuverability}</div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-heading py-2 px-4 rounded text-xs font-bold cursor-pointer transition-colors uppercase tracking-wider ${
        disabled
          ? "bg-gray-600/30 text-gray-500 cursor-not-allowed"
          : primary
            ? "bg-amber-600 hover:bg-amber-500 text-white"
            : "bg-amber-800/50 hover:bg-amber-700/50 text-amber-100 border border-amber-700/30"
      }`}
    >
      {label}
    </button>
  );
}

export function CombatPanel({
  combat,
  ships,
  npcs,
  onRollSeamanship,
  onChooseAction,
  onRollFleeAttempt,
  onRollCannons,
  onApplyResolution,
}: CombatPanelProps) {
  const attacker = ships[combat.attackerId];
  const defender = combat.isNPCCombat
    ? npcs[combat.defenderId]
    : ships[combat.defenderId];
  const isNPC = combat.isNPCCombat;

  return (
    <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-xl overflow-hidden border border-red-800/50 bg-gradient-to-br from-stone-900/95 via-red-950/90 to-stone-950/95 shadow-2xl shadow-black/50 backdrop-blur-md text-white p-4 text-sm w-96">
      <div className="font-heading text-center text-red-400 uppercase text-sm tracking-wider mb-3 border-b border-red-800/30 pb-2">
        Combat - Round {combat.round}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {attacker && (
          <ShipCombatStats ship={attacker} label={`Attacker (P${combat.attackerId})`} />
        )}
        {defender && (
          isNPC ? (
            <NPCCombatStats npc={defender as NPCShip} label="Defender (Merchant)" />
          ) : (
            <ShipCombatStats ship={defender as ShipState} label={`Defender (P${combat.defenderId})`} />
          )
        )}
      </div>

      <div className="text-center text-xs text-amber-400/70 mb-2">
        Distance: {combat.distance} hex{combat.distance > 1 ? "es" : ""}
      </div>

      {combat.stage === "seamanship" && (
        <div className="text-center space-y-2">
          <div className="text-amber-100/80 text-xs mb-2">
            Roll for seamanship to determine who acts first
          </div>
          <ActionButton
            label="Roll Seamanship"
            onClick={onRollSeamanship}
            primary
          />
        </div>
      )}

      {combat.stage === "chooseAction" && (
        <div className="space-y-3">
          <div className="text-center">
            <div className="text-amber-400 text-xs mb-1">Seamanship Winner</div>
            <div className="text-lg font-heading text-amber-100">
              {isNPC && combat.seamanshipWinner === combat.defenderId
                ? "Merchant"
                : `Player ${combat.seamanshipWinner}`}
            </div>
            <div className="text-[10px] text-amber-400/60 mt-1">
              Rolls: P{combat.attackerId}: {combat.seamanshipRolls[combat.attackerId]} |
              {isNPC ? " NPC" : ` P${combat.defenderId}`}: {combat.seamanshipRolls[combat.defenderId]}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-amber-100/80 text-xs text-center">
              {isNPC
                ? "Choose your action:"
                : `Player ${combat.seamanshipWinner}, choose your action:`}
            </div>
            <div className="flex gap-2 justify-center">
              <ActionButton
                label="Fire!"
                onClick={() => onChooseAction("fire")}
                primary
              />
              <ActionButton
                label="Board"
                onClick={() => onChooseAction("board")}
                disabled={combat.distance > 1}
              />
              <ActionButton
                label="Flee"
                onClick={() => onChooseAction("flee")}
              />
            </div>
            {combat.distance > 1 && (
              <div className="text-[10px] text-red-400/70 text-center">
                Boarding requires adjacent ships
              </div>
            )}
          </div>
        </div>
      )}

      {combat.stage === "fleeAttempt" && (
        <div className="space-y-3">
          <div className="text-center">
            <div className="text-amber-400 text-xs mb-1">Flee Attempt</div>
            <div className="text-amber-100/80 text-xs">
              {combat.seamanshipWinner === combat.attackerId
                ? "You are attempting to escape!"
                : isNPC
                  ? "The merchant is trying to flee!"
                  : `Player ${combat.seamanshipWinner} is attempting to flee!`}
            </div>
          </div>
          <div className="text-center">
            <ActionButton
              label="Roll Pursuit Check"
              onClick={onRollFleeAttempt}
              primary
            />
          </div>
        </div>
      )}

      {combat.stage === "cannons" && (
        <div className="text-center space-y-2">
          {combat.fleeOutcome === "caught" ? (
            <>
              <div className="text-red-400 text-sm font-heading uppercase mb-1">
                Pursuit Caught!
              </div>
              <div className="text-amber-100/80 text-xs mb-2">
                The fleeing ship is caught! Pursuer fires a parting shot.
              </div>
              {combat.fleeRolls && (
                <div className="text-[10px] text-amber-400/60 mb-2">
                  Pursuit rolls: Pursuer {combat.fleeRolls.pursuer} | Fleeer {combat.fleeRolls.fleeer}
                </div>
              )}
            </>
          ) : (
            <div className="text-amber-100/80 text-xs mb-2">
              Roll cannons to determine hits
            </div>
          )}
          <ActionButton
            label={combat.fleeOutcome === "caught" ? "Fire Parting Shot!" : "Fire Cannons!"}
            onClick={onRollCannons}
            primary
          />
        </div>
      )}

      {combat.stage === "resolution" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-amber-400 text-xs">Attacker Hits</div>
              <div className="text-2xl font-heading text-red-400">
                {combat.attackerHits}
              </div>
            </div>
            <div>
              <div className="text-amber-400 text-xs">Defender Hits</div>
              <div className="text-2xl font-heading text-red-400">
                {combat.defenderHits}
              </div>
            </div>
          </div>
          <div className="text-center">
            <ActionButton
              label="Apply Damage"
              onClick={onApplyResolution}
              primary
            />
          </div>
        </div>
      )}
    </div>
  );
}
