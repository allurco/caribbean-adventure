import type { CombatState, ShipState, CombatAction, NPCShip, SettledRound } from "../game/types";
import { answerLine, combatantLabel, drawRollsLine, noAnswer, pendingVolley, pursuitRollsLine, roundShown } from "./volleyText";
import { VolleyLines } from "./VolleyLines";
import { npcKind } from "./npcName";
import { defenderRollLine, drawIntro } from "./seamanshipText";
import { HUD_EDGE } from "./hudLayout";
import { boardingIntro } from "./boardingText";
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
  /** Fires the volley the fight waits on (#380: one Fire!, its hits landing at random). */
  onRollCannons: () => void;
  /** The answer to the first volley, fired by the ship answering (#348). */
  onReturnFire: () => void;
  /** Fights the boarding, the crew fight that ends the fight (#350). */
  onFightBoarding: () => void;
  /** Settles a round stored at the resolution before the round settled itself (#380). */
  onApplyResolution: () => void;
  /** Why the draw's winner may not board (`boardRefusalIn`, #350); null when it may. */
  boardRefusal: string | null;
  /** The last round the fight settled (`G.lastRound`, #380): its volleys stay on the panel through the next draw. */
  lastRound?: SettledRound;
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

/** The last round's volleys, settled on their own (#380), shown on the next round's panel until it fires. */
function LastRoundLines({
  settled,
  shooterLabel,
}: {
  settled: SettledRound;
  shooterLabel: (id: string) => string;
}) {
  return (
    <div className="space-y-0.5 text-center mb-3 border-b border-red-800/30 pb-2">
      <div className="text-[10px] text-amber-400/70 uppercase tracking-wider">Round {settled.round}</div>
      <VolleyLines volleys={settled.volleys} shooterLabel={shooterLabel} />
      {noAnswer(settled.volleys, settled.fleeOutcome) && (
        <div className="text-[10px] text-amber-400/60">No answer: the other ship could not fire back</div>
      )}
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
  onFightBoarding,
  onApplyResolution,
  boardRefusal,
  lastRound,
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
  // A fight stored before #346 records no volleys.
  const volleys = combat.volleys ?? [];
  const shooterLabel = (id: string) => combatantLabel(combat, id, npcLabel);
  // Who won the draw, by name ("Player 2", "Merchant"); shown only once the draw is in
  const winnerLabel = combat.seamanshipWinner ? shooterLabel(combat.seamanshipWinner) : "";
  // A seat's bare number for the short forms ("P2"), counting from 1 as everywhere else (#110)
  const seatNumber = (id: string) => Number(id) + 1;
  const pending = pendingVolley(combat);
  const lastShown = roundShown(combat, lastRound);
  // Who boards whom (#350): the draw's winner boards the other ship
  const boarderId = combat.seamanshipWinner ?? combat.attackerId;
  const boardedId = boarderId === combat.attackerId ? combat.defenderId : combat.attackerId;
  const crewOf = (id: string) => (ships[id] ?? npcs[id])?.stats?.crew.current ?? 0;
  // The ship that fled, whose shot-away masts slowed it (#348)
  const fleeing = combat.seamanshipWinner === null ? undefined : ships[combat.seamanshipWinner] ?? npcs[combat.seamanshipWinner];

  return (
    <div style={{ top: safeInset("top", HUD_EDGE) }} className="absolute left-1/2 -translate-x-1/2 rounded-xl overflow-hidden border border-red-800/50 bg-gradient-to-br from-stone-900/95 via-red-950/90 to-stone-950/95 shadow-2xl shadow-black/50 backdrop-blur-md text-white p-4 text-sm w-96">
      <div className="font-heading text-center text-red-400 uppercase text-sm tracking-wider mb-3 border-b border-red-800/30 pb-2">
        Combat - Round {combat.round}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {attacker && (
          <ShipCombatStats ship={attacker} label={`Attacker (P${seatNumber(combat.attackerId)})`} />
        )}
        {defender && (
          isNPC ? (
            <NPCCombatStats npc={defender as NPCShip} label={`Defender (${npcLabel})`} />
          ) : (
            <ShipCombatStats ship={defender as ShipState} label={`Defender (P${seatNumber(combat.defenderId)})`} />
          )
        )}
      </div>

      <div className="text-center text-xs text-amber-400/70 mb-2">
        Distance: {combat.distance} hex{combat.distance > 1 ? "es" : ""}
      </div>
      {gaugeLine && <div className="text-center text-xs text-sky-200/80 mb-2">{gaugeLine}</div>}

      {watchingLine && <div className="text-center text-xs italic text-amber-200/90 mb-1">{watchingLine}</div>}
      {waitingLine && <div className="text-center text-xs italic text-amber-200/90 mb-2">{waitingLine}</div>}

      {lastShown && <LastRoundLines settled={lastShown} shooterLabel={shooterLabel} />}

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
              {winnerLabel}
            </div>
            <div className="text-[10px] text-amber-400/60 mt-1">
              {drawRollsLine([
                { label: `P${seatNumber(combat.attackerId)}`, die: combat.seamanshipRolls[combat.attackerId], maneuverability: attacker?.stats?.maneuverability ?? 0 },
                { label: isNPC ? "NPC" : `P${seatNumber(combat.defenderId)}`, die: combat.seamanshipRolls[combat.defenderId], maneuverability: defender?.stats?.maneuverability ?? 0 },
              ])}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-amber-100/80 text-xs text-center">
              {isNPC
                ? "Choose your action:"
                : `${winnerLabel}, choose your action:`}
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
                disabled={!mayAct || boardRefusal !== null}
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
            {boardRefusal && <div className="text-[10px] text-red-400/70 text-center">{boardRefusal}</div>}
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
                ? `${winnerLabel} is attempting to flee!`
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
          <ActionButton
            label={combat.fleeOutcome === "caught" ? "Fire Parting Shot!" : "Fire!"}
            onClick={onRollCannons}
            disabled={!mayAct}
            primary
          />
        </div>
      )}

      {combat.stage === "returnFire" && (
        <div className="text-center space-y-2">
          <VolleyLines volleys={volleys} shooterLabel={shooterLabel} />
          <div className="text-amber-100/80 text-xs mb-2">
            {pending ? answerLine(shooterLabel(pending.shooterId)) : ""}
          </div>
          <ActionButton label="Fire!" onClick={onReturnFire} disabled={!mayAct} primary />
        </div>
      )}

      {/* The boarding (#350): no cannon fire this round, the crew fight decides it */}
      {combat.stage === "boarding" && (
        <div className="text-center space-y-2">
          <div className="text-red-400 text-sm font-heading uppercase">Boarding!</div>
          <div className="text-amber-100/80 text-xs">
            {boardingIntro(shooterLabel(boarderId), shooterLabel(boardedId))}
          </div>
          <div className="text-[10px] text-amber-400/70">
            Crew: {shooterLabel(boarderId)} {crewOf(boarderId)} | {shooterLabel(boardedId)} {crewOf(boardedId)}
          </div>
          <ActionButton label="Fight the Boarding!" onClick={onFightBoarding} disabled={!mayAct} primary />
        </div>
      )}

      {/* Only a fight stored at the resolution before #380 waits on it: every other round settles itself */}
      {combat.stage === "resolution" && (
        <div className="space-y-3">
          {/* The round's volleys in the order they were fired; each one's damage has landed (#346) */}
          <div className="space-y-1 text-center">
            <VolleyLines volleys={volleys} shooterLabel={shooterLabel} />
            {noAnswer(volleys, combat.fleeOutcome) && (
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
