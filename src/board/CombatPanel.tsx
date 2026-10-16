import type { CombatState, ShipState, CombatAction, NPCShip } from "../game/types";
import { npcKind } from "./npcName";
import { defenderRollLine, drawIntro } from "./seamanshipText";
import { HUD_EDGE } from "./hudLayout";
import { safeInset } from "./safeArea";

interface CombatPanelProps {
  combat: CombatState;
  ships: Record<string, ShipState>;
  npcs: Record<string, NPCShip>;
  onRollSeamanship: () => void;
  /** The defender's die of the draw (#347), rolled after the attacker's. */
  onRollDefenderSeamanship: () => void;
  onChooseAction: (action: CombatAction) => void;
  onRollFleeAttempt: () => void;
  onRollCannons: () => void;
  onApplyResolution: () => void;
  /** This client presses the fight's current step (`seatMayActInCombat`, #110); else its controls are off. */
  mayAct: boolean;
  /** Who and what this client waits on while another seat presses (`combatWaitingFor`). */
  waitingLine?: string | null;
  /** The line a seat watching someone else's fight sees (`fightWatched`). */
  watchingLine?: string | null;
  /** Who holds the weather gauge (`gaugeLine`, #264). */
  gaugeLine?: string | null;
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
  onRollDefenderSeamanship,
  onChooseAction,
  onRollFleeAttempt,
  onRollCannons,
  onApplyResolution,
  mayAct,
  waitingLine,
  watchingLine,
  gaugeLine,
}: CombatPanelProps) {
  const attacker = ships[combat.attackerId];
  const defender = combat.isNPCCombat
    ? npcs[combat.defenderId]
    : ships[combat.defenderId];
  const isNPC = combat.isNPCCombat;
  const npcLabel = isNPC && defender ? npcKind(defender as NPCShip) : "Merchant";
  // Seats count from 1 on the board, as everywhere else (#110)
  const seatLabel = (id: string | null) => Number(id) + 1;
  // A fight stored before #346 records no volleys.
  const volleys = combat.volleys ?? [];
  const shooterLabel = (id: string) => (isNPC && id === combat.defenderId ? npcLabel : `Player ${seatLabel(id)}`);

  return (
    <div style={{ top: safeInset("top", HUD_EDGE) }} className="absolute left-1/2 -translate-x-1/2 rounded-xl overflow-hidden border border-red-800/50 bg-gradient-to-br from-stone-900/95 via-red-950/90 to-stone-950/95 shadow-2xl shadow-black/50 backdrop-blur-md text-white p-4 text-sm w-96">
      <div className="font-heading text-center text-red-400 uppercase text-sm tracking-wider mb-3 border-b border-red-800/30 pb-2">
        Combat - Round {combat.round}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {attacker && (
          <ShipCombatStats ship={attacker} label={`Attacker (P${seatLabel(combat.attackerId)})`} />
        )}
        {defender && (
          isNPC ? (
            <NPCCombatStats npc={defender as NPCShip} label={`Defender (${npcLabel})`} />
          ) : (
            <ShipCombatStats ship={defender as ShipState} label={`Defender (P${seatLabel(combat.defenderId)})`} />
          )
        )}
      </div>

      <div className="text-center text-xs text-amber-400/70 mb-2">
        Distance: {combat.distance} hex{combat.distance > 1 ? "es" : ""}
      </div>
      {gaugeLine && <div className="text-center text-xs text-sky-200/80 mb-2">{gaugeLine}</div>}

      {watchingLine && <div className="text-center text-xs italic text-amber-200/90 mb-1">{watchingLine}</div>}
      {waitingLine && <div className="text-center text-xs italic text-amber-200/90 mb-2">{waitingLine}</div>}

      {combat.stage === "seamanship" && (
        <div className="text-center space-y-2">
          <div className="text-amber-100/80 text-xs mb-2">
            {drawIntro(combat)}
          </div>
          <ActionButton
            label="Roll Seamanship"
            onClick={onRollSeamanship}
            disabled={!mayAct}
            primary
          />
        </div>
      )}

      {combat.stage === "defenderSeamanship" && (
        <div className="text-center space-y-2">
          <div className="text-amber-100/80 text-xs mb-2">
            {defenderRollLine(combat, attacker?.stats)}
          </div>
          <ActionButton
            label="Roll Seamanship"
            onClick={onRollDefenderSeamanship}
            disabled={!mayAct}
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
                ? npcLabel
                : `Player ${seatLabel(combat.seamanshipWinner)}`}
            </div>
            <div className="text-[10px] text-amber-400/60 mt-1">
              Rolls: P{seatLabel(combat.attackerId)}: {combat.seamanshipRolls[combat.attackerId]} |
              {isNPC ? " NPC" : ` P${seatLabel(combat.defenderId)}`}: {combat.seamanshipRolls[combat.defenderId]}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-amber-100/80 text-xs text-center">
              {isNPC
                ? "Choose your action:"
                : `Player ${seatLabel(combat.seamanshipWinner)}, choose your action:`}
            </div>
            <div className="flex gap-2 justify-center">
              <ActionButton
                label="Fire!"
                onClick={() => onChooseAction("fire")}
                disabled={!mayAct}
                primary
              />
              <ActionButton
                label="Board"
                onClick={() => onChooseAction("board")}
                disabled={!mayAct || combat.distance > 1}
              />
              <ActionButton
                label="Flee"
                onClick={() => onChooseAction("flee")}
                disabled={!mayAct}
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
              {/* "You" only against an NPC: between two seats both screens show this, so it names the seat */}
              {!isNPC
                ? `Player ${seatLabel(combat.seamanshipWinner)} is attempting to flee!`
                : combat.seamanshipWinner === combat.attackerId
                  ? "You are attempting to escape!"
                  : `The ${npcLabel.toLowerCase()} is trying to flee!`}
            </div>
          </div>
          <div className="text-center">
            <ActionButton
              label="Roll Pursuit Check"
              onClick={onRollFleeAttempt}
              disabled={!mayAct}
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
          ) : combat.round === 1 ? (
            <div className="text-amber-100/80 text-xs mb-2">
              The ambush: the attacker fires first, and the defender answers if it still can
            </div>
          ) : (
            <div className="text-amber-100/80 text-xs mb-2">
              Roll cannons to determine hits
            </div>
          )}
          <ActionButton
            label={combat.fleeOutcome === "caught" ? "Fire Parting Shot!" : "Fire Cannons!"}
            onClick={onRollCannons}
            disabled={!mayAct}
            primary
          />
        </div>
      )}

      {combat.stage === "resolution" && (
        <div className="space-y-3">
          {/* The round's volleys in the order they were fired; each one's damage has landed (#346) */}
          <div className="space-y-1 text-center">
            {volleys.map((volley, i) => (
              <div key={i} className="text-xs text-amber-100/80">
                <span className="text-amber-400">{shooterLabel(volley.shooterId)}</span> fired {volley.guns} gun
                {volley.guns === 1 ? "" : "s"}:{" "}
                <span className="font-heading text-red-400">
                  {volley.hits} hit{volley.hits === 1 ? "" : "s"}
                </span>
              </div>
            ))}
            {volleys.length === 1 && combat.fleeOutcome !== "caught" && (
              <div className="text-[10px] text-amber-400/60">No answer: the other ship could not fire back</div>
            )}
          </div>
          <div className="text-center">
            <ActionButton
              label="End Round"
              onClick={onApplyResolution}
              disabled={!mayAct}
              primary
            />
          </div>
        </div>
      )}
    </div>
  );
}
