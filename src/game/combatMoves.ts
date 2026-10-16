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
 * main.
 */
import type { CaribbeanState, CombatAction, CombatStage, CombatState, NPCShip, ShipState, Volley, VolleyAim } from "./types";
import { COMBAT_ACTIONS, VOLLEY_AIMS } from "./types";
import {
  canReturnFire,
  resolveSeamanship,
  resolveFleeAttempt,
  shouldNPCFlee,
  countCannonHits,
  aimedDamage,
  npcAim,
  applyDamage,
  isSunk,
  isDerelict,
  createLootFromShip,
  createLootFromNPC,
  getEffectiveCannons,
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

/**
 * May the draw's winner choose this action? Only while the fight waits on
 * the choice, only fire, board or flee, and boarding only from the next hex.
 * Round 1 is the ambush (#346): fire is the only action then.
 */
export function canChooseCombatAction(G: CaribbeanState, action: unknown): action is CombatAction {
  if (!atCombatStage(G, "chooseAction")) return false;
  if (!isOneOf(COMBAT_ACTIONS, action)) return false;
  if (fightOf(G).round === 1 && action !== "fire") return false;
  if (action === "board" && fightOf(G).distance > 1) return false;
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
    // NPC decides to flee if hull < 2 OR outgunned (cannons limited by current crew)
    if (shouldNPCFlee(npc.stats.hull.current, getEffectiveCannons(npc), getEffectiveCannons(attacker))) {
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
 * pursuer's parting shot next.
 */
export function applyFleeAttempt(G: CaribbeanState, d6: RollD6): CombatStepOutcome {
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
  // Go to cannons stage, but only pursuer fires
  combat.stage = "cannons";
  return "continues";
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
 * other side, aimed at `aim` (#348), and the damage lands at once, before
 * anything else is rolled. Recorded in the round's volleys and in the side's hits.
 */
function fireVolley(G: CaribbeanState, combat: CombatState, shooterId: string, aim: VolleyAim, d6: RollD6): void {
  const shooter = combatantOf(G, combat, shooterId);
  const targetId = opponentOf(combat, shooterId);
  const target = combatantOf(G, combat, targetId);
  const guns = getEffectiveCannons(shooter);
  const hits = fireBroadside(guns, d6);
  combat.volleys = [...(combat.volleys ?? []), { shooterId, guns, aim, hits }];
  if (shooterId === combat.attackerId) combat.attackerHits = hits;
  else combat.defenderHits = hits;
  if (hits === 0) return;

  const upgrades = "upgrades" in shooter ? shooter.upgrades : [];
  applyDamage(target, aimedDamage(hits, aim, upgrades, target.damage.masts));
  // An escort's attacker that takes a hit fails its no-damage condition.
  if (targetId === combat.attackerId) {
    const mission = G.ships[combat.attackerId].activeMission;
    if (mission) failEscortMission(mission);
  }
}

/**
 * Who fires first this round: in round 1 (the ambush) the attacker; after a
 * caught flight the pursuer, alone; otherwise the draw's winner, who chose
 * to fire (the attacker in a fight from before #346 with no winner).
 */
function firstToFire(combat: Pick<CombatState, "round" | "attackerId" | "defenderId" | "seamanshipWinner" | "fleeOutcome">): string {
  if (combat.round === 1 || combat.seamanshipWinner === null) return combat.attackerId;
  if (combat.fleeOutcome === "caught") {
    return combat.seamanshipWinner === combat.attackerId ? combat.defenderId : combat.attackerId;
  }
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

/** Whether the engine aims this ship's volleys (an NPC's, `npcAim`), not a seat. */
export function engineAims(combat: Pick<CombatState, "isNPCCombat" | "defenderId">, shooterId: string): boolean {
  return combat.isNPCCombat && shooterId === combat.defenderId;
}

/** The steps that fire a volley (#348): the cannons (the first, or a parting shot) and the answer. */
export function isVolleyStage(stage: CombatStage): stage is "cannons" | "returnFire" {
  return stage === "cannons" || stage === "returnFire";
}

/**
 * The volleys a step fired, from the fight `before` it to the fight `after`
 * (#348): the first volley as the answer waits on its aim, then only the
 * answer, or both when nobody answers by hand. None at any other step, once
 * the fight has ended, or from a fight stored with no volleys (before #346).
 */
export function volleysFired(
  before: Pick<CombatState, "stage" | "volleys">,
  after: Pick<CombatState, "stage" | "volleys"> | undefined,
): Volley[] {
  if (!after || !isVolleyStage(before.stage) || after.stage === before.stage) return [];
  const firedBefore = before.stage === "returnFire" ? (before.volleys ?? []).length : 0;
  return (after.volleys ?? []).slice(firedBefore);
}

/**
 * May the volley the fight waits on be fired with `aim`? Only at the
 * cannons or the answer (`stage`), and never with an aim the game does not
 * know. A seat's volley needs hull, masts or crew; an NPC's takes the
 * engine's aim (`npcAim`), so it may come with none, and a known aim sent
 * for it is not read.
 */
export function canFireVolley(G: CaribbeanState, stage: "cannons" | "returnFire", aim: unknown): boolean {
  if (!atCombatStage(G, stage)) return false;
  if (aim != null && !isOneOf(VOLLEY_AIMS, aim)) return false;
  const combat = fightOf(G);
  return aim != null || engineAims(combat, volleyShooter(combat));
}

/** The aim the shooter fires with: the engine's for an NPC, else its seat's, which `canFireVolley` required. */
function aimOf(combat: CombatState, shooterId: string, aim: VolleyAim | null | undefined): VolleyAim {
  if (engineAims(combat, shooterId)) return npcAim();
  if (aim == null) throw new Error("A seat's volley is aimed: check canFireVolley before firing");
  return aim;
}

/**
 * The cannons, volley by volley (#346): the first to fire (`firstToFire`)
 * fires, aimed (#348), and its damage lands. Then the other side answers if
 * it still can (`canReturnFire`, after that damage): an NPC at once, aimed
 * by the engine; a seat at its own step, `returnFire`, to aim it. After a
 * caught flight only the pursuer fires. The sunk and the derelict are
 * settled in the resolution. Check `canFireVolley` first.
 */
export function applyCannons(G: CaribbeanState, aim: VolleyAim | null | undefined, d6: RollD6): void {
  const combat = fightOf(G);
  combat.volleys = [];
  combat.attackerHits = 0;
  combat.defenderHits = 0;

  const first = firstToFire(combat);
  fireVolley(G, combat, first, aimOf(combat, first, aim), d6);

  const answering = opponentOf(combat, first);
  if (combat.fleeOutcome === "caught" || !canReturnFire(combatantOf(G, combat, answering), combat.distance)) {
    combat.stage = "resolution";
    return;
  }
  if (engineAims(combat, answering)) {
    fireVolley(G, combat, answering, npcAim(), d6);
    combat.stage = "resolution";
    return;
  }
  combat.stage = "returnFire";
}

/** The answer (#348): the ship fired on aims and fires back, and its damage lands. Check `canFireVolley` first. */
export function applyReturnFire(G: CaribbeanState, aim: VolleyAim | null | undefined, d6: RollD6): void {
  const combat = fightOf(G);
  const answering = volleyShooter(combat);
  fireVolley(G, combat, answering, aimOf(combat, answering, aim), d6);
  combat.stage = "resolution";
}

/**
 * The resolution: the volleys' damage has landed; the sunk and the
 * derelict are settled (bounties, glory, missions, loot, a sunk captain lost). The
 * fight ends there, or after a parting shot; else a new round begins.
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
      combatEnded = true;
    } else if (npc.stats.crew.current <= 0) {
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
    attacker.isDerelict = true;
    combatEnded = true;
  }

  // The sunk ships leave G.ships here, and their captains die with them (#265)
  for (const id of sunk) loseShip(G, id, "sunk");

  // After a failed flee attempt, combat ends after the parting shot
  if (combat.fleeOutcome === "caught") {
    combatEnded = true;
  }

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
