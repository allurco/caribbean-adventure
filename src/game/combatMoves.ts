/**
 * The combat phase's moves (#345), as pure helpers over G: whether a step
 * may be pressed (`atCombatStage`, `canChooseCombatAction`) and what it does
 * (`apply*`). `Game.ts` wires them into the phase; who may press each step
 * is `combatActor`'s rule, applied around the phase's moves by
 * `withSeatedCombat`.
 *
 * Dice come in as `d6` (boardgame.io's `random.D6`), rolled in the order
 * the moves always rolled them. A step that ends the fight clears
 * `G.combat` and answers "ended": the caller then sets the phase back to
 * main. The round settles itself (#380): the step that fires its last volley
 * (or a caught flight with no parting shot) settles it too, recording it in
 * `G.lastRound` for the board.
 */
import type { CaribbeanState, CombatAction, CombatStage, CombatState, NPCShip, SettledRound, ShipState, Volley } from "./types";
import { COMBAT_ACTIONS } from "./types";
import {
  canReturnFire,
  resolveSeamanship,
  resolveFleeAttempt,
  shouldNPCFlee,
  countCannonHits,
  rollHitLocations,
  volleyOutcome,
  applyDamage,
  isSunk,
  isDerelict,
  createLootFromShip,
  createLootFromNPC,
  getEffectiveCannons,
  isInGunRange,
} from "./combat";
import { isOneOf } from "./moveArgs";
import { loseShip } from "./captainDeath";
import { spawnFlotillaForPlayer } from "./npcManager";
import { applyMerchantAction, applyPirateBounty, shouldSpawnFlotilla } from "./reputation";
import { awardCombatGlory } from "./scoring";
import { nextLootId } from "./ids";
import { checkAssassinationMission, failEscortMission, completeMission } from "./missions";

/** Whether a step left the fight going or ended it (G.combat cleared). */
export type CombatStepOutcome = "continues" | "ended";

/** One six-sided die, from the game's shared dice. */
export type RollD6 = () => number;

/** The fight on, for a step whose stage was checked first. */
function fightOf(G: CaribbeanState): CombatState {
  if (!G.combat) throw new Error("No fight on: check the combat stage before applying a step");
  return G.combat;
}

/**
 * A fight as it opens (#346): round 1 is the ambush, so there is no draw.
 * The attacker's broadside is the first step, and fire the only action.
 */
export function openFight(attackerId: string, defenderId: string, distance: number, isNPCCombat: boolean): CombatState {
  return {
    attackerId,
    defenderId,
    round: 1,
    stage: "cannons",
    seamanshipWinner: null,
    seamanshipRolls: {},
    actionChosen: "fire",
    attackerHits: 0,
    defenderHits: 0,
    volleys: [],
    distance,
    isNPCCombat,
    fleeOutcome: null,
    fleeRolls: null,
  };
}

/** Is a fight on, at this step? Every combat move is refused otherwise. */
export function atCombatStage(G: CaribbeanState, stage: CombatStage): boolean {
  return G.combat !== undefined && G.combat.stage === stage;
}

/** Do `id`'s guns reach the other ship of the fight (#356)? */
function reaches(G: CaribbeanState, combat: CombatState, id: string): boolean {
  return isInGunRange(combatantOf(G, combat, id), combat.distance);
}

/**
 * Do the guns of the ship that fires first this round (`firstToFire`) reach
 * the other ship (#356)? A ship out of range never fires first. False with
 * no fight on.
 */
export function firstToFireReaches(G: CaribbeanState): boolean {
  if (!G.combat) return false;
  return reaches(G, G.combat, firstToFire(G.combat));
}

/**
 * May the draw's winner choose this action? Only while the fight waits on
 * the choice, only fire, board or flee, boarding only from the next hex, and
 * fire only when the ship that would fire first reaches (`firstToFireReaches`,
 * #356). Round 1 is the ambush (#346): fire is the only action then (the
 * attacker fires first, and it attacked from within its range).
 */
export function canChooseCombatAction(G: CaribbeanState, action: unknown): action is CombatAction {
  if (!atCombatStage(G, "chooseAction")) return false;
  if (!isOneOf(COMBAT_ACTIONS, action)) return false;
  const combat = fightOf(G);
  if (combat.round === 1) return action === "fire";
  if (action === "fire" && !firstToFireReaches(G)) return false;
  if (action === "board" && combat.distance > 1) return false;
  return true;
}

/** A ship in the fight's manoeuvrability, as the draw and the flight add it to a die. */
function maneuverabilityOf(ship: ShipState | NPCShip): number {
  return ship.stats?.maneuverability ?? 0;
}

/**
 * The draw from round 2 (#347), the attacker's die: d6 from the game's
 * shared dice, recorded as it is rolled. The defender rolls its own next
 * (`applyRollDefenderSeamanship`), but an NPC's die is rolled at once, with
 * the attacker's, so a fight against an NPC never waits on it.
 */
export function applyRollSeamanship(G: CaribbeanState, d6: RollD6): void {
  const combat = fightOf(G);
  combat.seamanshipRolls[combat.attackerId] = d6();
  if (combat.isNPCCombat) {
    applyRollDefenderSeamanship(G, d6);
    return;
  }
  combat.stage = "defenderSeamanship";
}

/**
 * The draw's second die, the defender's (#347), and the draw decided: each
 * die plus its ship's manoeuvrability, a tie to the defender. An NPC that
 * wins it picks its own action (flee or fire); otherwise the winner chooses.
 */
export function applyRollDefenderSeamanship(G: CaribbeanState, d6: RollD6): void {
  const combat = fightOf(G);
  const attacker = G.ships[combat.attackerId];
  const defender = combatantOf(G, combat, combat.defenderId);
  const defenderRoll = d6();
  combat.seamanshipRolls[combat.defenderId] = defenderRoll;

  const winner = resolveSeamanship(
    maneuverabilityOf(attacker),
    combat.seamanshipRolls[combat.attackerId],
    maneuverabilityOf(defender),
    defenderRoll,
  );
  combat.seamanshipWinner = winner === "attacker" ? combat.attackerId : combat.defenderId;

  // If NPC won seamanship in NPC combat, auto-choose their action
  if (combat.isNPCCombat && combat.seamanshipWinner === combat.defenderId) {
    const npc = G.npcs[combat.defenderId];
    // The NPC chooses as a seat may (`canChooseCombatAction`): in round 1
    // (a fight from before #346) it fires, never flees. Otherwise it flees
    // when its guns cannot reach (#356), or if hull < 2 OR outgunned
    // (cannons limited by current crew).
    const outgunned = shouldNPCFlee(npc.stats.hull.current, getEffectiveCannons(npc), getEffectiveCannons(attacker));
    if (combat.round !== 1 && (!firstToFireReaches(G) || outgunned)) {
      combat.actionChosen = "flee";
      combat.stage = "fleeAttempt";
    } else {
      combat.actionChosen = "fire";
      combat.stage = "cannons";
    }
  } else {
    // Player chooses action
    combat.stage = "chooseAction";
  }
}

/**
 * The draw's winner chooses fire, flee or board. Boarding an NPC takes its
 * cargo and gold and ends the fight; boarding a player ship just ends it.
 * `turn` dates any bounty the boarding earns.
 */
export function applyCombatAction(G: CaribbeanState, action: CombatAction, turn: number): CombatStepOutcome {
  const combat = fightOf(G);
  // In hotseat mode, we trust the UI to show who should choose
  // In NPC combat, player always chooses (NPC auto-fires if it won)

  // In NPC combat, boarding captures the NPC's cargo
  if (action === "board" && combat.isNPCCombat) {
    const attacker = G.ships[combat.attackerId];
    const npc = G.npcs[combat.defenderId];

    // Add bounty for boarding a merchant (not flotillas)
    if (npc.role === "MERCHANT") {
      applyMerchantAction(G, combat.attackerId, "board_merchant", npc.nation, npc.bounty, turn);

      // Check if flotilla should spawn
      if (shouldSpawnFlotilla(attacker.bounties, npc.nation)) {
        spawnFlotillaForPlayer(G, npc.nation, combat.attackerId);
      }
    }

    // Transfer cargo and gold to player (simplified boarding)
    for (const [good, amount] of Object.entries(npc.cargo)) {
      attacker.cargo[good as keyof typeof attacker.cargo] += amount;
    }
    attacker.gold += npc.gold;
    // Remove the NPC
    delete G.npcs[combat.defenderId];
    G.combat = undefined;
    return "ended";
  }

  combat.actionChosen = action;

  if (action === "flee") {
    // Transition to flee attempt stage
    combat.stage = "fleeAttempt";
    return "continues";
  }

  if (action === "board") {
    // Boarding ends combat (simplified - winner captures ship)
    G.combat = undefined;
    return "ended";
  }

  // action === "fire"
  combat.stage = "cannons";
  return "continues";
}

/**
 * The flight: the pursuer's die against the fleeing ship's, each plus its
 * manoeuvrability. A clean escape ends the fight; a ship caught takes the
 * pursuer's parting shot next, if the pursuer's guns reach it (#356), and
 * the fight ends after it. Out of range, the round settles at once (#380).
 * `turn` dates what the settling records.
 */
export function applyFleeAttempt(G: CaribbeanState, d6: RollD6, turn: number): CombatStepOutcome {
  const combat = fightOf(G);

  const isNPC = combat.isNPCCombat;

  // Determine who is fleeing (the seamanship winner chose to flee)
  const fleeingId = combat.seamanshipWinner!;
  const pursuerId = fleeingId === combat.attackerId
    ? combat.defenderId
    : combat.attackerId;

  // Get ships/NPCs
  const fleeerShip = isNPC && fleeingId === combat.defenderId
    ? G.npcs[fleeingId]
    : G.ships[fleeingId];
  const pursuerShip = isNPC && pursuerId === combat.defenderId
    ? G.npcs[pursuerId]
    : G.ships[pursuerId];

  // Roll seamanship for flee attempt
  const pursuerRoll = d6();
  const fleeerRoll = d6();

  combat.fleeRolls = { pursuer: pursuerRoll, fleeer: fleeerRoll };

  const pursuerManeuv = pursuerShip.stats?.maneuverability ?? 0;
  const fleeerManeuv = fleeerShip.stats?.maneuverability ?? 0;

  // Shot-away masts slow the flight (#348)
  const outcome = resolveFleeAttempt(
    pursuerManeuv,
    pursuerRoll,
    fleeerManeuv,
    fleeerRoll,
    fleeerShip.damage.masts
  );

  combat.fleeOutcome = outcome;

  if (outcome === "escaped") {
    // Clean escape - combat ends, fleeer could move 1 hex away
    // (For now, just end combat - movement would require more logic)
    G.combat = undefined;
    return "ended";
  }

  // Caught - pursuer gets a free parting shot (defender can't return fire)
  // Go to cannons stage, but only pursuer fires: if its guns reach (#356),
  // else no shot, and the round settles at once (#380).
  if (reaches(G, combat, pursuerId)) {
    combat.stage = "cannons";
    return "continues";
  }
  return applyCombatResolution(G, turn);
}

/** A broadside's dice: one per gun its crew can man. */
function fireBroadside(cannons: number, d6: RollD6): number {
  const rolls: number[] = [];
  for (let i = 0; i < cannons; i++) {
    rolls.push(d6());
  }
  return countCannonHits(rolls);
}

/** A ship in the fight by its id: the NPC when it is the defender of an NPC fight. */
function combatantOf(G: CaribbeanState, combat: CombatState, id: string): ShipState | NPCShip {
  return combat.isNPCCombat && id === combat.defenderId ? G.npcs[id] : G.ships[id];
}

/** The other side of the fight from `id`. */
function opponentOf(combat: Pick<CombatState, "attackerId" | "defenderId">, id: string): string {
  return id === combat.attackerId ? combat.defenderId : combat.attackerId;
}

/**
 * One volley (#346): `shooterId` fires every gun its crew can man at the
 * other side, each hit then rolls where it lands (#380), and the damage
 * lands at once, before anything else is rolled. Recorded in the round's
 * volleys and in the side's hits.
 */
function fireVolley(G: CaribbeanState, combat: CombatState, shooterId: string, d6: RollD6): void {
  const shooter = combatantOf(G, combat, shooterId);
  const targetId = opponentOf(combat, shooterId);
  const target = combatantOf(G, combat, targetId);
  const guns = getEffectiveCannons(shooter);
  const hits = fireBroadside(guns, d6);
  const locations = rollHitLocations(hits, d6);
  // The shots and the damage as fired, so the volley reads the same after the shooter sinks or buys another shot
  const upgrades = "upgrades" in shooter ? shooter.upgrades : [];
  const { shots, dealt } = volleyOutcome(locations, upgrades, target.damage.masts);
  combat.volleys = [...(combat.volleys ?? []), { shooterId, guns, hits, locations, shots, dealt }];
  if (shooterId === combat.attackerId) combat.attackerHits = hits;
  else combat.defenderHits = hits;
  if (hits === 0) return;

  applyDamage(target, dealt);
  // An escort's attacker that takes a hit fails its no-damage condition.
  if (targetId === combat.attackerId) {
    const mission = G.ships[combat.attackerId].activeMission;
    if (mission) failEscortMission(mission);
  }
}

/**
 * Who fires first this round: after a caught flight the pursuer, alone (in
 * any round, as `combatActor` has it, #356); in round 1 (the ambush) the
 * attacker; otherwise the draw's winner, who chose to fire (the attacker in
 * a fight from before #346 with no winner).
 */
function firstToFire(combat: Pick<CombatState, "round" | "attackerId" | "defenderId" | "seamanshipWinner" | "fleeOutcome">): string {
  if (combat.fleeOutcome === "caught" && combat.seamanshipWinner !== null) {
    return opponentOf(combat, combat.seamanshipWinner);
  }
  if (combat.round === 1 || combat.seamanshipWinner === null) return combat.attackerId;
  return combat.seamanshipWinner;
}

/**
 * The ship that fires the volley the fight waits on (#348): at the cannons
 * the first to fire (`firstToFire`), at the answer the other side.
 */
export function volleyShooter(combat: Pick<CombatState, "stage" | "round" | "attackerId" | "defenderId" | "seamanshipWinner" | "fleeOutcome">): string {
  const first = firstToFire(combat);
  return combat.stage === "returnFire" ? opponentOf(combat, first) : first;
}

/** The steps that fire a volley (#348): the cannons (the first, or a parting shot) and the answer. */
export function isVolleyStage(stage: CombatStage): stage is "cannons" | "returnFire" {
  return stage === "cannons" || stage === "returnFire";
}

/** The same fight, both sides as they were. */
export function sameFight(a: Pick<CombatState, "attackerId" | "defenderId">, b: Pick<CombatState, "attackerId" | "defenderId">): boolean {
  return a.attackerId === b.attackerId && a.defenderId === b.defenderId;
}

/**
 * The round a step settled (#380): `next.lastRound` when it is the record
 * of the round the fight was on `before` the step, and the fight has left
 * that round (gone on to the next, or ended). Null otherwise.
 */
export function roundSettledBy(
  before: Pick<CombatState, "attackerId" | "defenderId" | "round">,
  next: Pick<CaribbeanState, "combat" | "lastRound">,
): SettledRound | null {
  const settled = next.lastRound;
  if (!settled || settled.round !== before.round || !sameFight(settled, before)) return null;
  if (next.combat && sameFight(next.combat, before) && next.combat.round === before.round) return null;
  return settled;
}

/**
 * The volleys a step fired, from the fight `before` it to the state `next`
 * after it (#348): the first volley as the answer waits, then only the
 * answer, or every volley of the round when the round settled in the step
 * (#380: read from `next.lastRound`, the fight then on to the next round or
 * over). None at any other step, or from a fight stored with no volleys
 * (before #346).
 */
export function volleysFired(
  before: Pick<CombatState, "stage" | "volleys" | "attackerId" | "defenderId" | "round">,
  next: Pick<CaribbeanState, "combat" | "lastRound">,
): Volley[] {
  if (!isVolleyStage(before.stage)) return [];
  const after = next.combat;
  const firedBefore = before.stage === "returnFire" ? (before.volleys ?? []).length : 0;
  if (after && sameFight(after, before) && after.round === before.round) {
    return after.stage === before.stage ? [] : (after.volleys ?? []).slice(firedBefore);
  }
  return (roundSettledBy(before, next)?.volleys ?? []).slice(firedBefore);
}

/**
 * May the volley the fight waits on be fired? Only at the cannons or the
 * answer (`stage`), and with no argument (#380: hits land at random, so
 * nobody aims): an aim sent by a client from before is refused.
 */
export function canFireVolley(G: CaribbeanState, stage: "cannons" | "returnFire", stray?: unknown): boolean {
  return atCombatStage(G, stage) && stray === undefined;
}

/** Whether the engine fires this ship's answer on its own (an NPC's), not a seat. */
function engineFires(combat: Pick<CombatState, "isNPCCombat" | "defenderId">, shooterId: string): boolean {
  return combat.isNPCCombat && shooterId === combat.defenderId;
}

/**
 * The cannons, volley by volley (#346): the first to fire (`firstToFire`)
 * fires, and its damage lands. Then the other side answers if it still can
 * (`canReturnFire`, after that damage): an NPC at once; a seat at its own
 * step, `returnFire`. After a caught flight only the pursuer fires. With no
 * answer to wait on, the round settles in the same step (#380). Check
 * `canFireVolley` first. `turn` dates what the settling records.
 */
export function applyCannons(G: CaribbeanState, d6: RollD6, turn: number): CombatStepOutcome {
  const combat = fightOf(G);
  combat.volleys = [];
  combat.attackerHits = 0;
  combat.defenderHits = 0;

  const first = firstToFire(combat);
  fireVolley(G, combat, first, d6);

  const answering = opponentOf(combat, first);
  if (combat.fleeOutcome === "caught" || !canReturnFire(combatantOf(G, combat, answering), combat.distance)) {
    return applyCombatResolution(G, turn);
  }
  if (engineFires(combat, answering)) {
    fireVolley(G, combat, answering, d6);
    return applyCombatResolution(G, turn);
  }
  combat.stage = "returnFire";
  return "continues";
}

/** The answer (#348): the ship fired on fires back, its damage lands, and the round settles (#380). Check `canFireVolley` first. */
export function applyReturnFire(G: CaribbeanState, d6: RollD6, turn: number): CombatStepOutcome {
  const combat = fightOf(G);
  fireVolley(G, combat, volleyShooter(combat), d6);
  return applyCombatResolution(G, turn);
}

/**
 * The resolution: the volleys' damage has landed; the sunk and the
 * derelict are settled (bounties, glory, missions, loot, a sunk captain lost). The
 * fight ends there, or after a parting shot; else a new round begins.
 * The round is recorded in `G.lastRound` (#380). It runs by itself as the
 * round's last volley lands; the `applyResolution` move still presses it
 * for a fight stored at the `resolution` stage before #380.
 * `turn` dates any bounty or claim it settles.
 */
export function applyCombatResolution(G: CaribbeanState, turn: number): CombatStepOutcome {
  const combat = fightOf(G);

  const attacker = G.ships[combat.attackerId];
  const isNPC = combat.isNPCCombat;
  const defender = isNPC
    ? G.npcs[combat.defenderId]
    : G.ships[combat.defenderId];

  // Check for sunk/derelict
  let combatEnded = false;
  // Player ships sunk this exchange: lost once both sides' glory and bounties are settled
  const sunk: string[] = [];
  // Ships this round left derelict, never one derelict before it (#380)
  const leftDerelict: string[] = [];
  // Every ship the round sank, the NPC too, for the fight's end (#380)
  const sankThisRound: string[] = [];

  // Check if NPC defender is sunk
  if (isNPC) {
    const npc = G.npcs[combat.defenderId];
    if (npc.stats.hull.current <= 0) {
      // Add bounty for sinking a merchant (not flotillas)
      if (npc.role === "MERCHANT") {
        applyMerchantAction(G, combat.attackerId, "sink_merchant", npc.nation, npc.bounty, turn);

        // Check if flotilla should spawn
        if (shouldSpawnFlotilla(attacker.bounties, npc.nation)) {
          spawnFlotillaForPlayer(G, npc.nation, combat.attackerId);
        }
      }

      // Award combat glory for sinking worthy targets (flotillas)
      awardCombatGlory(attacker, npc);

      // Check assassination mission completion
      if (attacker.activeMission &&
          checkAssassinationMission(attacker.activeMission, combat.defenderId, npc)) {
        attacker.gold += attacker.activeMission.reward.gold;
        attacker.score += attacker.activeMission.reward.glory;
        completeMission(attacker.activeMission);
        attacker.activeMission = undefined;
      }

      const loot = createLootFromNPC(npc, nextLootId(G));
      G.floatingLoot.push(loot);
      delete G.npcs[combat.defenderId];
      sankThisRound.push(combat.defenderId);
      combatEnded = true;
    } else if (npc.stats.crew.current <= 0) {
      if (!npc.isDerelict) leftDerelict.push(combat.defenderId);
      npc.isDerelict = true;
      combatEnded = true;
    }
  } else {
    const defenderShip = defender as typeof attacker;
    if (isSunk(defenderShip)) {
      // Award combat glory to attacker for sinking player ship
      awardCombatGlory(attacker, defenderShip);
      // Sinking a pirate pays the attacker their own nation's bounty
      // on them (#201), before the sunk ship's record goes.
      applyPirateBounty(G, combat.attackerId, combat.defenderId, turn);

      const loot = createLootFromShip(defenderShip, nextLootId(G));
      G.floatingLoot.push(loot);
      sunk.push(combat.defenderId);
      combatEnded = true;
    } else if (isDerelict(defenderShip)) {
      if (!defenderShip.isDerelict) leftDerelict.push(combat.defenderId);
      defenderShip.isDerelict = true;
      combatEnded = true;
    }
  }

  if (isSunk(attacker)) {
    // Award combat glory to defender for sinking attacker (if player vs player)
    if (!isNPC) {
      const defenderShip = defender as typeof attacker;
      awardCombatGlory(defenderShip, attacker);
      // The defender collects their nation's bounty on a pirate
      // attacker (#201); a flotilla that sinks one pays nobody.
      applyPirateBounty(G, combat.defenderId, combat.attackerId, turn);
    }

    const loot = createLootFromShip(attacker, nextLootId(G));
    G.floatingLoot.push(loot);
    sunk.push(combat.attackerId);
    combatEnded = true;
  } else if (isDerelict(attacker)) {
    if (!attacker.isDerelict) leftDerelict.push(combat.attackerId);
    attacker.isDerelict = true;
    combatEnded = true;
  }

  // The sunk ships leave G.ships here, and their captains die with them (#265)
  for (const id of sunk) loseShip(G, id, "sunk");
  sankThisRound.push(...sunk);

  // After a failed flee attempt, combat ends after the parting shot
  if (combat.fleeOutcome === "caught") {
    combatEnded = true;
  }

  G.lastRound = {
    attackerId: combat.attackerId,
    defenderId: combat.defenderId,
    isNPCCombat: combat.isNPCCombat,
    round: combat.round,
    volleys: combat.volleys ?? [],
    fleeOutcome: combat.fleeOutcome,
    fleeRolls: combat.fleeRolls,
    ended: combatEnded,
    sunk: sankThisRound,
    leftDerelict,
  };

  if (combatEnded) {
    G.combat = undefined;
    return "ended";
  }

  // Combat continues - new round
  combat.round++;
  combat.stage = "seamanship";
  combat.fleeOutcome = null;
  combat.fleeRolls = null;
  combat.seamanshipWinner = null;
  combat.seamanshipRolls = {};
  combat.actionChosen = null;
  combat.attackerHits = 0;
  combat.defenderHits = 0;
  combat.volleys = [];
  return "continues";
}
