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
import type { CaribbeanState, CombatAction, CombatStage, CombatState } from "./types";
import { COMBAT_ACTIONS } from "./types";
import {
  canReturnFire,
  resolveSeamanship,
  resolveFleeAttempt,
  shouldNPCFlee,
  countCannonHits,
  calculateDamage,
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

/** Is a fight on, at this step? Every combat move is refused otherwise. */
export function atCombatStage(G: CaribbeanState, stage: CombatStage): boolean {
  return G.combat !== undefined && G.combat.stage === stage;
}

/**
 * May the draw's winner choose this action? Only while the fight waits on
 * the choice, only fire, board or flee, and boarding only from the next hex.
 */
export function canChooseCombatAction(G: CaribbeanState, action: unknown): action is CombatAction {
  if (!atCombatStage(G, "chooseAction")) return false;
  if (!isOneOf(COMBAT_ACTIONS, action)) return false;
  if (action === "board" && fightOf(G).distance > 1) return false;
  return true;
}

/**
 * The draw: one die each, plus each ship's manoeuvrability. An NPC that
 * wins it picks its own action (flee or fire); otherwise the winner chooses.
 */
export function applyRollSeamanship(G: CaribbeanState, d6: RollD6): void {
  const combat = fightOf(G);

  const attacker = G.ships[combat.attackerId];
  const isNPC = combat.isNPCCombat;
  const defender = isNPC
    ? G.npcs[combat.defenderId]
    : G.ships[combat.defenderId];

  const attackerRoll = d6();
  const defenderRoll = d6();

  combat.seamanshipRolls[combat.attackerId] = attackerRoll;
  combat.seamanshipRolls[combat.defenderId] = defenderRoll;

  const attackerManeuv = attacker.stats?.maneuverability ?? 0;
  const defenderManeuv = defender.stats?.maneuverability ?? 0;

  const winner = resolveSeamanship(
    attackerManeuv,
    attackerRoll,
    defenderManeuv,
    defenderRoll
  );

  combat.seamanshipWinner =
    winner === "attacker" ? combat.attackerId : combat.defenderId;

  // If NPC won seamanship in NPC combat, auto-choose their action
  if (isNPC && combat.seamanshipWinner === combat.defenderId) {
    const npc = G.npcs[combat.defenderId];
    const npcHull = npc.stats.hull.current;
    // Use effective cannons (limited by current crew)
    const npcCannons = getEffectiveCannons(npc);
    const enemyCannons = getEffectiveCannons(attacker);

    // NPC decides to flee if hull < 2 OR outgunned
    if (shouldNPCFlee(npcHull, npcCannons, enemyCannons)) {
      combat.actionChosen = "flee";
      combat.stage = "fleeAttempt";
    } else {
      // NPC chooses to fire
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

  const outcome = resolveFleeAttempt(
    pursuerManeuv,
    pursuerRoll,
    fleeerManeuv,
    fleeerRoll
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

/**
 * The cannons: after a caught flight only the pursuer fires; otherwise the
 * attacker fires, then the defender if it can answer. Hits are counted
 * here and land in the resolution.
 */
export function applyCannons(G: CaribbeanState, d6: RollD6): void {
  const combat = fightOf(G);

  const isNPC = combat.isNPCCombat;
  const attacker = G.ships[combat.attackerId];
  const defender = isNPC
    ? G.npcs[combat.defenderId]
    : G.ships[combat.defenderId];

  // Check if this is a parting shot from failed flee
  const isPartingShot = combat.fleeOutcome === "caught";

  if (isPartingShot) {
    // Only the pursuer fires, fleeer cannot return fire
    const fleeingId = combat.seamanshipWinner!;
    const pursuerId = fleeingId === combat.attackerId
      ? combat.defenderId
      : combat.attackerId;

    const pursuerShip = isNPC && pursuerId === combat.defenderId
      ? G.npcs[pursuerId]
      : G.ships[pursuerId];

    // Use effective cannons (limited by current crew)
    const pursuerHits = fireBroadside(getEffectiveCannons(pursuerShip), d6);

    // Assign hits based on who is the pursuer
    if (pursuerId === combat.attackerId) {
      combat.attackerHits = pursuerHits;
      combat.defenderHits = 0; // Fleeer can't return fire
    } else {
      combat.attackerHits = 0; // Fleeer can't return fire
      combat.defenderHits = pursuerHits;
    }
  } else {
    // Normal combat - both sides fire

    // Attacker fires - use effective cannons (limited by current crew)
    combat.attackerHits = fireBroadside(getEffectiveCannons(attacker), d6);

    // Defender fires back if in range
    if (canReturnFire(defender, combat.distance)) {
      // Use effective cannons (limited by current crew)
      combat.defenderHits = fireBroadside(getEffectiveCannons(defender), d6);
    } else {
      combat.defenderHits = 0;
    }
  }

  combat.stage = "resolution";
}

/**
 * The resolution: both sides' hits land, then the sunk and the derelict
 * are settled (bounties, glory, missions, loot, a sunk captain lost). The
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

  // Apply damage to defender from attacker's hits
  if (combat.attackerHits > 0) {
    const damage = calculateDamage(combat.attackerHits, attacker.upgrades);
    applyDamage(defender, damage);
  }

  // Apply damage to attacker from defender's hits
  if (combat.defenderHits > 0) {
    // NPCs don't have upgrades array
    const defenderUpgrades = isNPC ? [] : (defender as typeof attacker).upgrades;
    const damage = calculateDamage(combat.defenderHits, defenderUpgrades);
    applyDamage(attacker, damage);

    // Fail escort mission if attacker took damage
    if (attacker.activeMission) {
      failEscortMission(attacker.activeMission);
    }
  }

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
  return "continues";
}
