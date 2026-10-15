/**
 * The fight as the table watches it (#263): each change of `G.combat`,
 * `G.ships` and `G.npcs` that today's combat rules make, turned into beats
 * with their moments timed. Pure, and derived from `G` alone, so every seat
 * plays the same beats from the same moves; the visuals and the sounds both
 * play from these beats (cuePlayer.ts), so a gun's flash, its report and the
 * target's lurch never drift apart.
 *
 * How many guns fire and how many hit are today's rules (`attackerHits`,
 * `defenderHits`, the guns the crew can work); which of the shots hit, and
 * the small spread in when each gun goes off, are seeded per fight
 * (ADR 0007), so they look the same on every seat.
 */
import type { CaribbeanState, CombatState, NPCShip, ShipState } from "../../game/types";
import { canReturnFire, getEffectiveCannons } from "../../game/combat";
import { hexToWorld, nearestImage, type Hex } from "../../game/hex";
import { SEED_FEATURES } from "../visuals/seedFeatures";
import { stream, subSeed, worldSeedOf } from "../visuals/subSeed";
import { BEATS, pacedSeconds } from "./beatTiming";
import { shotSeconds } from "./broadside";

/** One gun's shot: when it fires and lands (s from the beat's start), and whether it strikes the target. */
export interface VolleyShot {
  fireAt: number;
  landAt: number;
  hit: boolean;
}

/** One ship's broadside at the other. */
export interface Volley {
  shooterId: string;
  targetId: string;
  shots: VolleyShot[];
  /** Chain shot that struck brings the target's mainmast down. */
  mastFalls: boolean;
}

interface BeatBase {
  /** How long the beat plays, s; its smoke and wreckage linger after. */
  seconds: number;
  /**
   * The beat's name in its fight (ids, round, move): its effects draw their
   * variety from it, so every seat sees the same sparks and smoke whatever
   * it played before. Beats made by hand (tests) may leave it out.
   */
  seedKey?: string;
}

export interface DeclareBeat extends BeatBase {
  kind: "declare";
  attackerId: string;
  defenderId: string;
}

export interface VolleyBeat extends BeatBase {
  kind: "volley";
  /** The attacker's, then the reply (none when the target cannot or may not fire back). */
  volleys: Volley[];
}

export interface FleeBeat extends BeatBase {
  kind: "flee";
  fleeingId: string;
  pursuerId: string;
  outcome: "escaped" | "caught";
}

export interface CloseAlongsideBeat extends BeatBase {
  kind: "closeAlongside";
  attackerId: string;
  defenderId: string;
}

export interface SinkBeat extends BeatBase {
  kind: "sink";
  shipId: string;
  /** The ship that holed her, which she lists toward; null if it is gone too. */
  shooterId: string | null;
}

export type CombatBeat = DeclareBeat | VolleyBeat | FleeBeat | CloseAlongsideBeat | SinkBeat;

export interface TimelineOptions {
  /** Shorter beats (and no camera moves or shake, which the players of the beats leave out). */
  reducedMotion?: boolean;
}

/** Seconds between one gun and the next along a broadside, and the spread about it. */
export const GUN_SPACING = 0.26;
const GUN_JITTER = 0.08;
/** The pause between the attacker's last gun and the reply's first. */
const REPLY_GAP = 0.7;
/** How long a volley's beat runs on after its last shot lands. */
const VOLLEY_TAIL = 1.2;

type Combatant = ShipState | NPCShip;

function combatant(state: CaribbeanState, id: string, combat: CombatState): Combatant | undefined {
  return combat.isNPCCombat && id === combat.defenderId ? state.npcs[id] : state.ships[id];
}

/** World distance between two hexes, the short way round a wrapping map. */
function worldDistance(state: CaribbeanState, a: Hex, b: Hex): number {
  const [ax, , az] = hexToWorld(a);
  const [bx, , bz] = hexToWorld(nearestImage(a, b, state.wrap));
  return Math.hypot(bx - ax, bz - az);
}

/** `count` shots, `hits` of them striking (chosen by `random`), fired one after another from `start`. */
function rippledShots(count: number, hits: number, start: number, flight: number, random: () => number): VolleyShot[] {
  // A seeded shuffle of which guns hit.
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const hitting = new Set(order.slice(0, Math.min(hits, count)));
  return Array.from({ length: count }, (_, i) => {
    const fireAt = start + i * GUN_SPACING + random() * GUN_JITTER;
    // Misses fly a touch longer or shorter, falling past or short of her.
    const landAt = fireAt + flight * (hitting.has(i) ? 1 : 0.85 + 0.3 * random());
    return { fireAt, landAt, hit: hitting.has(i) };
  });
}

function volleyBeat(next: CaribbeanState, combat: CombatState): VolleyBeat | null {
  const attacker = combatant(next, combat.attackerId, combat);
  const defender = combatant(next, combat.defenderId, combat);
  if (!attacker || !defender) return null;
  const flight = shotSeconds(worldDistance(next, attacker.position, defender.position));
  const seed = worldSeedOf(next);
  const random = (shooterId: string) =>
    stream(subSeed(seed, SEED_FEATURES.combatShots, combat.attackerId, combat.defenderId, combat.round, shooterId));

  // Who fires: both sides, unless the target is out of range or this is the parting shot at a ship caught fleeing.
  const fleeingId = combat.fleeOutcome === "caught" ? combat.seamanshipWinner : null;
  const sides = [
    { shooterId: combat.attackerId, targetId: combat.defenderId, shooter: attacker, hits: combat.attackerHits },
    { shooterId: combat.defenderId, targetId: combat.attackerId, shooter: defender, hits: combat.defenderHits },
  ].filter(({ shooterId, shooter }) => {
    if (fleeingId !== null) return shooterId !== fleeingId;
    return shooterId === combat.attackerId || canReturnFire(shooter, combat.distance);
  });

  const volleys: Volley[] = [];
  let start = 0;
  let end = 0;
  for (const side of sides) {
    const count = getEffectiveCannons(side.shooter);
    if (count === 0) continue;
    const shots = rippledShots(count, side.hits, start, flight, random(side.shooterId));
    const upgrades = "upgrades" in side.shooter ? side.shooter.upgrades : [];
    volleys.push({ shooterId: side.shooterId, targetId: side.targetId, shots, mastFalls: side.hits > 0 && upgrades.includes("chain_shot") });
    start = shots[shots.length - 1].fireAt + REPLY_GAP;
    end = Math.max(end, ...shots.map((s) => s.landAt));
  }
  return volleys.length > 0
    ? { kind: "volley", volleys, seconds: end + VOLLEY_TAIL, seedKey: `${combat.attackerId}:${combat.defenderId}:${combat.round}:volley` }
    : null;
}

/** Ships and NPCs that left `G` as new wreckage appeared: they went down. */
function sunkIds(prev: CaribbeanState, next: CaribbeanState): string[] {
  if (next.floatingLoot.length <= prev.floatingLoot.length) return [];
  return [...Object.keys(prev.ships).filter((id) => !(id in next.ships)), ...Object.keys(prev.npcs).filter((id) => !(id in next.npcs))];
}

/**
 * The beats between `prev` and `next`, in the order they play. Nothing for
 * the first state (`prev` undefined), so loading a game mid-fight is still.
 */
export function combatBeatsFrom(prev: CaribbeanState | undefined, next: CaribbeanState, options: TimelineOptions = {}): CombatBeat[] {
  if (!prev || prev === next) return [];
  const reduced = options.reducedMotion ?? false;
  const paced = (seconds: number) => pacedSeconds(seconds, reduced);
  const before = prev.combat;
  const after = next.combat;
  const beats: CombatBeat[] = [];
  const fight = before ?? after;
  const keyOf = (move: string) => (fight ? `${fight.attackerId}:${fight.defenderId}:${fight.round}:${move}` : move);

  if (!before && after) {
    beats.push({ kind: "declare", attackerId: after.attackerId, defenderId: after.defenderId, seconds: paced(BEATS.declare.seconds), seedKey: keyOf("declare") });
  }

  if (before?.stage === "fleeAttempt" && (!after || after.stage === "cannons")) {
    const fleeingId = before.seamanshipWinner ?? before.defenderId;
    const pursuerId = fleeingId === before.attackerId ? before.defenderId : before.attackerId;
    beats.push({ kind: "flee", fleeingId, pursuerId, outcome: after ? "caught" : "escaped", seconds: paced(BEATS.flee.seconds), seedKey: keyOf("flee") });
  }

  if (before?.stage === "chooseAction" && !after && before.distance <= 1 && sunkIds(prev, next).length === 0) {
    // Boarding is the one choice that ends the fight at once.
    beats.push({ kind: "closeAlongside", attackerId: before.attackerId, defenderId: before.defenderId, seconds: paced(BEATS.closeAlongside.seconds), seedKey: keyOf("board") });
  }

  if (before?.stage === "cannons" && after?.stage === "resolution") {
    const volley = volleyBeat(next, after);
    if (volley) beats.push(volley);
  }

  for (const shipId of sunkIds(prev, next)) {
    const other = before ? (shipId === before.attackerId ? before.defenderId : before.attackerId) : null;
    const shooterId = other !== null && (other in next.ships || other in next.npcs) ? other : null;
    beats.push({ kind: "sink", shipId, shooterId, seconds: paced(BEATS.sink.seconds), seedKey: keyOf(`sink:${shipId}`) });
  }

  return beats;
}
