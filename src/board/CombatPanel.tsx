import type { CombatState, ShipState, CombatAction, NPCShip, Volley, VolleyAim } from "../game/types";
import { VOLLEY_AIMS } from "../game/types";
import { AIM_LABELS, answerLine, pendingVolley, pursuitRollsLine, volleyLine, type PendingVolley } from "./volleyAim";
import { npcKind } from "./npcName";
import { defenderRollLine, drawIntro } from "./seamanshipText";
import { HUD_EDGE } from "./hudLayout";
import { safeInset } from "./safeArea";
import { seatName } from "./seat";

interface CombatPanelProps {
  combat: CombatState;
  ships: Record<string, ShipState>;
  npcs: Record<string, NPCShip>;
  onRollSeamanship: () => void;
  /** The defender's die of the draw (#347), rolled after the attacker's. */
  onRollDefenderSeamanship: () => void;
  onChooseAction: (action: CombatAction) => void;
  onRollFleeAttempt: () => void;
  /** Fires the volley the fight waits on, aimed (#348); an NPC's volley takes no aim, the engine picks it. */
  onRollCannons: (aim?: VolleyAim) => void;
  /** The answer to the first volley, aimed by the ship answering (#348). */
  onReturnFire: (aim: VolleyAim) => void;
  onApplyResolution: () => void;
  /** The draw's winner may choose fire (`canChooseCombatAction`). */
  mayChooseFire: boolean;
  /** The guns of the ship that fires first this round reach the other ship (`firstToFireReaches`, #356). */
  firstToFireReaches: boolean;
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
        <div>Mast damage: {ship.damage.masts}</div>
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
        <div>Mast damage: {npc.damage.masts}</div>
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

/** The round's volleys in the order they were fired, each one's damage landed (#346), and where each was aimed (#348). */
function VolleyLines({
  volleys,
  shooterLabel,
  upgradesOf,
}: {
  volleys: Volley[];
  shooterLabel: (id: string) => string;
  upgradesOf: (id: string) => readonly string[];
}) {
  return (
    <>
      {volleys.map((volley, i) => {
        const line = volleyLine(volley, upgradesOf(volley.shooterId));
        return (
          <div key={i} className="text-xs text-amber-100/80">
            <span className="text-amber-400">{shooterLabel(volley.shooterId)}</span> {line.fired}:{" "}
            <span className="font-heading text-red-400">{line.hits}</span>
          </div>
        );
      })}
    </>
  );
}

/**
 * The aim of the volley the fight waits on (#348): one button per aim for a
 * seat's volley, each firing it there; one for an NPC's, which the engine aims.
 */
function AimButtons({
  pending,
  shooter,
  fireLabel,
  onFire,
  onEngineFire,
  mayAct,
}: {
  pending: PendingVolley | null;
  shooter: string;
  fireLabel: string;
  /** Fires a seat's volley, aimed. */
  onFire: (aim: VolleyAim) => void;
  /** Fires an NPC's volley, which the engine aims; only at the cannons, as an NPC answers on its own. */
  onEngineFire?: () => void;
  mayAct: boolean;
}) {
  if (pending?.aimedBy === "engine" && onEngineFire) {
    return <ActionButton label={`${shooter} fires`} onClick={onEngineFire} disabled={!mayAct} primary />;
  }
  return (
    <div className="space-y-1">
      <div className="text-[10px] text-amber-400/70 uppercase tracking-wider">{fireLabel}: aim at</div>
      <div className="flex gap-2 justify-center">
        {VOLLEY_AIMS.map((aim) => (
          <ActionButton key={aim} label={AIM_LABELS[aim]} onClick={() => onFire(aim)} disabled={!mayAct} primary={aim === "hull"} />
        ))}
      </div>
    </div>
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
  onReturnFire,
  onApplyResolution,
  mayChooseFire,
  firstToFireReaches,
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
  const pending = pendingVolley(combat);
  // A ship's upgrades, read for the hit its shot added; NPCs carry none
  const upgradesOf = (id: string): readonly string[] => ships[id]?.upgrades ?? [];
  // The ship that fled, whose shot-away masts slowed it (#348)
  const fleeing = combat.seamanshipWinner === null ? undefined : ships[combat.seamanshipWinner] ?? npcs[combat.seamanshipWinner];

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
            {drawIntro({ ships }, combat)}
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
            {defenderRollLine({ ships }, combat)}
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
                disabled={!mayAct || !mayChooseFire}
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
            {!firstToFireReaches && (
              <div className="text-[10px] text-red-400/70 text-center">
                Out of range: {mayAct ? "your" : `${seatName({ ships }, combat.seamanshipWinner ?? combat.attackerId)}'s`} guns cannot reach from {combat.distance} hexes
              </div>
            )}
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
                  : firstToFireReaches
                    ? `The ${npcLabel.toLowerCase()} is trying to flee!`
                    : `The ${npcLabel.toLowerCase()} can't reach you and tries to flee!`}
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
                  {pursuitRollsLine(combat.fleeRolls, fleeing?.damage.masts ?? 0)}
                </div>
              )}
            </>
          ) : combat.round === 1 ? (
            <div className="text-amber-100/80 text-xs mb-2">
              The ambush: the attacker fires first, and the defender answers if it still can
            </div>
          ) : (
            <div className="text-amber-100/80 text-xs mb-2">
              {pending ? `${shooterLabel(pending.shooterId)} fires first; the other ship answers if it still can` : ""}
            </div>
          )}
          <AimButtons
            pending={pending}
            shooter={pending ? shooterLabel(pending.shooterId) : ""}
            fireLabel={combat.fleeOutcome === "caught" ? "Fire Parting Shot" : "Fire"}
            onFire={onRollCannons}
            onEngineFire={() => onRollCannons()}
            mayAct={mayAct}
          />
        </div>
      )}

      {combat.stage === "returnFire" && (
        <div className="text-center space-y-2">
          <VolleyLines volleys={volleys} shooterLabel={shooterLabel} upgradesOf={upgradesOf} />
          <div className="text-amber-100/80 text-xs mb-2">
            {pending ? answerLine(shooterLabel(pending.shooterId)) : ""}
          </div>
          <AimButtons pending={pending} shooter={pending ? shooterLabel(pending.shooterId) : ""} fireLabel="Answer" onFire={onReturnFire} mayAct={mayAct} />
        </div>
      )}

      {combat.stage === "resolution" && (
        <div className="space-y-3">
          {/* The round's volleys in the order they were fired; each one's damage has landed (#346) */}
          <div className="space-y-1 text-center">
            <VolleyLines volleys={volleys} shooterLabel={shooterLabel} upgradesOf={upgradesOf} />
            {volleys.length === 1 && combat.fleeOutcome !== "caught" && (
              <div className="text-[10px] text-amber-400/60">No answer: the other ship could not fire back</div>
            )}
            {/* A fight stored before #346 records no volleys: only a recorded empty round is a shot not fired */}
            {combat.volleys !== undefined && volleys.length === 0 && combat.fleeOutcome === "caught" && (
              <>
                <div className="text-red-400 text-sm font-heading uppercase">Pursuit Caught!</div>
                <div className="text-amber-100/80 text-xs">Caught, but out of the pursuer&apos;s range: no parting shot</div>
                {combat.fleeRolls && (
                  <div className="text-[10px] text-amber-400/60">
                    {pursuitRollsLine(combat.fleeRolls, fleeing?.damage.masts ?? 0)}
                  </div>
                )}
              </>
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
