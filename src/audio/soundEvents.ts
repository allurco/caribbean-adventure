import type { CaribbeanState, CombatState, GoodType, Nation, PirateCause, ShipClass, ShipState } from "../game/types";
import { GOOD_TYPES } from "../game/types";
import { hexEquals } from "../game/hex";
import { findAccessiblePort } from "../game/moves";
import { isVolleyStage, roundSettledBy, volleysFired } from "../game/combatMoves";

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
  | { type: "turnedPirate"; playerId: string; cause: PirateCause }
  | { type: "pirateBountyClaimed"; captorId: string; pirateId: string; nation: Nation; gold: number }
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
    // A ship whose captain changed was just set up by the draft pick (home
    // port, class, gold), which is not a voyage or a purchase.
    const drafted = before?.captain?.id !== after.captain?.id;
    if (before && before !== after && !drafted) events.push(...shipEvents(shipId, before, after, next, inCombat));
  }

  for (const [npcId, after] of Object.entries(next.npcs)) {
    const before = prev.npcs[npcId];
    if (before && !hexEquals(before.position, after.position)) events.push({ type: "npcSailed", npcId });
  }

  // A ship or NPC that disappears as new wreckage appears went down; an NPC
  // that leaves without any (a merchant arriving) did not, nor one that
  // struck to a boarding, whose cargo may float (#350).
  if (next.floatingLoot.length > prev.floatingLoot.length && prev.combat?.stage !== "boarding") {
    for (const shipId of Object.keys(prev.ships)) {
      if (!(shipId in next.ships)) events.push({ type: "shipSunk", shipId, isNpc: false });
    }
    for (const npcId of Object.keys(prev.npcs)) {
      if (!(npcId in next.npcs)) events.push({ type: "shipSunk", shipId: npcId, isNpc: true });
    }
  }

  events.push(...pirateEvents(prev, next));
  events.push(...combatEvents(prev.combat, next));
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

/** Players newly turned pirate, then pirate bounties newly collected (#201). */
function pirateEvents(prev: CaribbeanState, next: CaribbeanState): SoundEvent[] {
  const events: SoundEvent[] = [];
  for (const [playerId, record] of Object.entries(next.pirates ?? {})) {
    if (!prev.pirates?.[playerId]) events.push({ type: "turnedPirate", playerId, cause: record.cause });
  }
  for (const claim of (next.bountyClaims ?? []).slice(prev.bountyClaims?.length ?? 0)) {
    const { captorId, pirateId, nation, gold } = claim;
    events.push({ type: "pirateBountyClaimed", captorId, pirateId, nation, gold });
  }
  return events;
}

function totalDamage(ship: ShipState): number {
  return ship.damage.hull + ship.damage.crew + ship.damage.masts;
}

/** Combat moves by the stage they leave and the one they arrive at (or the round they settled, #380). */
function combatEvents(before: CombatState | undefined, next: Pick<CaribbeanState, "combat" | "lastRound">): SoundEvent[] {
  const after = next.combat;
  if (!before && after) {
    return [{ type: "combatStarted", attackerId: after.attackerId, defenderId: after.defenderId }];
  }
  if (!before) return [];

  const events: SoundEvent[] = [];
  const nextStage = after?.stage;

  // Each captain's die of the draw is its own roll (#347): the attacker's, then the defender's.
  const rolling = before.stage === "seamanship" || before.stage === "defenderSeamanship";
  if (rolling && after && nextStage !== before.stage) {
    events.push({ type: "seamanshipRolled" });
  }
  // Each volley is fired on its own step (#348): the first, then the answer, each with its own hits;
  // the last of a round settles it, the fight then on to the draw or over (#380)
  const fired = volleysFired(before, next);
  if (isVolleyStage(before.stage) && fired.length > 0) {
    const hitsBy = (id: string) => fired.filter((v) => v.shooterId === id).reduce((sum, v) => sum + v.hits, 0);
    events.push({ type: "cannonsFired", attackerHits: hitsBy(before.attackerId), defenderHits: hitsBy(before.defenderId) });
  }
  // The crew fight (#350) ends the combat, a side striking its colours.
  if (before.stage === "boarding" && !after) {
    events.push({ type: "boarded", attackerId: before.attackerId, defenderId: before.defenderId });
  }
  // Caught: the parting shot next, or, the pursuer out of range (#356), the fight over at once (#380)
  const caught = after?.fleeOutcome === "caught" || roundSettledBy(before, next)?.fleeOutcome === "caught";
  if (before.stage === "fleeAttempt" && (caught || !after)) events.push({ type: "fleeAttempted", outcome: caught ? "caught" : "escaped" });

  if (!after) events.push({ type: "combatEnded" });
  return events;
}
