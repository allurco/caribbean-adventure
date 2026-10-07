import type { CaribbeanState, CombatState, GoodType, ShipClass, ShipState } from "../game/types";
import { GOOD_TYPES } from "../game/types";
import { hexEquals } from "../game/hex";
import { findAccessiblePort } from "../game/moves";

/**
 * Something audible that happened between two game states (#73). Derived
 * from `G` alone, so every client hears the same moves without the game
 * itself knowing about sound.
 */
export type SoundEvent =
  | { type: "shipSailed"; shipId: string }
  | { type: "docked"; shipId: string; portName: string }
  | { type: "npcSailed"; npcId: string }
  | { type: "goodsBought"; shipId: string; good: GoodType; amount: number }
  | { type: "goodsSold"; shipId: string; good: GoodType; amount: number }
  | { type: "upgradeBought"; shipId: string; upgradeId: string }
  | { type: "shipRepaired"; shipId: string }
  | { type: "shipBought"; shipId: string; shipClass: ShipClass }
  | { type: "goldStashed"; shipId: string; amount: number }
  | { type: "shipDerelict"; shipId: string }
  | { type: "shipSunk"; shipId: string; isNpc: boolean }
  | { type: "combatStarted"; attackerId: string; defenderId: string }
  | { type: "seamanshipRolled" }
  | { type: "cannonsFired"; attackerHits: number; defenderHits: number }
  | { type: "boarded"; attackerId: string; defenderId: string }
  | { type: "fleeAttempted"; outcome: "escaped" | "caught" }
  | { type: "combatEnded" };

export type SoundEventType = SoundEvent["type"];

/**
 * The sound events between `prev` and `next`, in a stable order: each
 * player's ship, then the NPCs, then sinkings, then combat. Nothing for the
 * first state (`prev` undefined), so loading a game is silent.
 */
export function soundEventsFrom(prev: CaribbeanState | undefined, next: CaribbeanState): SoundEvent[] {
  if (!prev || prev === next) return [];
  const inCombat = prev.combat !== undefined || next.combat !== undefined;
  const events: SoundEvent[] = [];

  for (const [shipId, after] of Object.entries(next.ships)) {
    const before = prev.ships[shipId];
    if (before && before !== after) events.push(...shipEvents(shipId, before, after, next, inCombat));
  }

  for (const [npcId, after] of Object.entries(next.npcs)) {
    const before = prev.npcs[npcId];
    if (before && !hexEquals(before.position, after.position)) events.push({ type: "npcSailed", npcId });
  }

  // A ship or NPC that disappears as new wreckage appears went down; an NPC
  // that leaves without any (a merchant arriving, a boarded prize) did not.
  if (next.floatingLoot.length > prev.floatingLoot.length) {
    for (const shipId of Object.keys(prev.ships)) {
      if (!(shipId in next.ships)) events.push({ type: "shipSunk", shipId, isNpc: false });
    }
    for (const npcId of Object.keys(prev.npcs)) {
      if (!(npcId in next.npcs)) events.push({ type: "shipSunk", shipId: npcId, isNpc: true });
    }
  }

  events.push(...combatEvents(prev.combat, next.combat));
  return events;
}

function shipEvents(
  shipId: string,
  before: ShipState,
  after: ShipState,
  next: CaribbeanState,
  inCombat: boolean
): SoundEvent[] {
  const events: SoundEvent[] = [];
  const moved = !hexEquals(before.position, after.position);

  if (moved) {
    events.push({ type: "shipSailed", shipId });
    const port = findAccessiblePort(after.position, next.cells, next.wrap);
    if (port?.portName) events.push({ type: "docked", shipId, portName: port.portName });
  }

  const goldDelta = after.gold - before.gold;
  const sameShip = before.shipClass === after.shipClass;

  // A trade moves cargo one way and gold the other, in port, outside combat
  // (boarding and wreck salvage add both at once).
  if (!moved && !inCombat && sameShip) {
    for (const good of GOOD_TYPES) {
      const delta = after.cargo[good] - before.cargo[good];
      if (delta > 0 && goldDelta < 0) events.push({ type: "goodsBought", shipId, good, amount: delta });
      if (delta < 0 && goldDelta > 0) events.push({ type: "goodsSold", shipId, good, amount: -delta });
    }
  }

  for (const upgradeId of after.upgrades) {
    if (!before.upgrades.includes(upgradeId)) events.push({ type: "upgradeBought", shipId, upgradeId });
  }

  if (goldDelta < 0 && sameShip && totalDamage(after) < totalDamage(before)) {
    events.push({ type: "shipRepaired", shipId });
  }

  if (!sameShip && after.shipClass) events.push({ type: "shipBought", shipId, shipClass: after.shipClass });

  if (after.stashedGold > before.stashedGold) {
    events.push({ type: "goldStashed", shipId, amount: after.stashedGold - before.stashedGold });
  }

  if (after.isDerelict && !before.isDerelict) events.push({ type: "shipDerelict", shipId });

  return events;
}

function totalDamage(ship: ShipState): number {
  return ship.damage.hull + ship.damage.crew + ship.damage.masts;
}

/** Combat moves by the stage they leave and the one they arrive at. */
function combatEvents(before: CombatState | undefined, after: CombatState | undefined): SoundEvent[] {
  if (!before && after) {
    return [{ type: "combatStarted", attackerId: after.attackerId, defenderId: after.defenderId }];
  }
  if (!before) return [];

  const events: SoundEvent[] = [];
  const nextStage = after?.stage;

  if (before.stage === "seamanship" && after && nextStage !== "seamanship") {
    events.push({ type: "seamanshipRolled" });
  }
  if (before.stage === "cannons" && nextStage === "resolution" && after) {
    events.push({ type: "cannonsFired", attackerHits: after.attackerHits, defenderHits: after.defenderHits });
  }
  // Choosing an action ends the combat only by boarding (flee and fire move on).
  if (before.stage === "chooseAction" && !after) {
    events.push({ type: "boarded", attackerId: before.attackerId, defenderId: before.defenderId });
  }
  if (before.stage === "fleeAttempt" && !after) events.push({ type: "fleeAttempted", outcome: "escaped" });
  if (before.stage === "fleeAttempt" && nextStage === "cannons") events.push({ type: "fleeAttempted", outcome: "caught" });

  if (!after) events.push({ type: "combatEnded" });
  return events;
}
