/**
 * The fight as the table watches it (#263): each change of `G.combat`,
 * `G.ships` and `G.npcs` that today's combat rules make, turned into beats
 * with their moments timed. Pure, and derived from `G` alone, so every seat
 * plays the same beats from the same moves; the visuals and the sounds both
 * play from these beats (cuePlayer.ts), so a gun's flash, its report and the
 * target's lurch never drift apart.
 *
 * How many guns fire and how many hit are the round's volleys, in the
 * order they were fired (`combat.volleys`, #346); which of the shots hit, and
 * the small spread in when each gun goes off, are seeded per fight
 * (ADR 0007), so they look the same on every seat.
 */
import type { CaribbeanState, CombatState, NPCShip, ShipState, Volley as FiredVolley } from "../../game/types";
import { hexToWorld, nearestImage, type Hex } from "../../game/hex";
import { hitCountsOf } from "../../game/combat";
import { isVolleyStage, roundSettledBy, volleysFired } from "../../game/combatMoves";
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
  /** In the order they were fired: the first, then the answer (none when the target could not or might not fire back). */
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

/**
 * The beat of the volleys `firedNow`, the round's volleys after the first
 * `firedBefore` (#348: the answer is fired on its own step, after the first),
 * fired in the round of `combat`, the fight before the step. A ship the
 * volleys sank is gone from `next`: it is drawn where `prev` had it.
 */
function volleyBeat(prev: CaribbeanState, next: CaribbeanState, combat: CombatState, firedNow: readonly FiredVolley[], firedBefore: number): VolleyBeat | null {
  const either = (id: string) => combatant(next, id, combat) ?? combatant(prev, id, combat);
  const attacker = either(combat.attackerId);
  const defender = either(combat.defenderId);
  if (!attacker || !defender) return null;
  const flight = shotSeconds(worldDistance(next, attacker.position, defender.position));
  const seed = worldSeedOf(next);
  const random = (shooterId: string) =>
    stream(subSeed(seed, SEED_FEATURES.combatShots, combat.attackerId, combat.defenderId, combat.round, shooterId));

  // The volleys just fired, in order, each with the guns it was rolled with (#346).
  const volleys: Volley[] = [];
  let start = 0;
  let end = 0;
  for (const fired of firedNow) {
    const shooter = either(fired.shooterId);
    if (!shooter || fired.guns === 0) continue;
    const targetId = fired.shooterId === combat.attackerId ? combat.defenderId : combat.attackerId;
    const shots = rippledShots(fired.guns, fired.hits, start, flight, random(fired.shooterId));
    volleys.push({ shooterId: fired.shooterId, targetId, shots, mastFalls: mastFalls(fired) });
    start = shots[shots.length - 1].fireAt + REPLY_GAP;
    end = Math.max(end, ...shots.map((s) => s.landAt));
  }
  return volleys.length > 0
    ? { kind: "volley", volleys, seconds: end + VOLLEY_TAIL, seedKey: `${combat.attackerId}:${combat.defenderId}:${combat.round}:volley${firedBefore > 0 ? `:${firedBefore}` : ""}` }
    : null;
}

/**
 * Whether a volley brings a mast down (#348, #380): it dealt mast damage,
 * so never when its mast hits all went to the hull past the cap. A volley
 * stored without its damage (before save version 10) falls when a hit
 * landed on the masts.
 */
export function mastFalls(volley: FiredVolley): boolean {
  return volley.dealt ? volley.dealt.masts > 0 : hitCountsOf(volley).masts > 0;
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

  // Caught: the parting shot next, or, the pursuer out of range (#356), the
  // fight over at once, the round settled with the flight caught (#380)
  if (before?.stage === "fleeAttempt" && (!after || after.fleeOutcome === "caught")) {
    const fleeingId = before.seamanshipWinner ?? before.defenderId;
    const pursuerId = fleeingId === before.attackerId ? before.defenderId : before.attackerId;
    const caught = after?.fleeOutcome === "caught" || roundSettledBy(before, next)?.fleeOutcome === "caught";
    beats.push({ kind: "flee", fleeingId, pursuerId, outcome: caught ? "caught" : "escaped", seconds: paced(BEATS.flee.seconds), seedKey: keyOf("flee") });
  }

  if (before?.stage === "chooseAction" && !after && before.distance <= 1 && sunkIds(prev, next).length === 0) {
    // Boarding is the one choice that ends the fight at once.
    beats.push({ kind: "closeAlongside", attackerId: before.attackerId, defenderId: before.defenderId, seconds: paced(BEATS.closeAlongside.seconds), seedKey: keyOf("board") });
  }

  // Each volley plays as it is fired (#348): the first as the answer waits, then the answer;
  // the last of a round as the round settles, the fight then on to the draw or over (#380)
  if (before && isVolleyStage(before.stage)) {
    const firedBefore = before.stage === "returnFire" ? (before.volleys ?? []).length : 0;
    const volley = volleyBeat(prev, next, before, volleysFired(before, next), firedBefore);
    if (volley) beats.push(volley);
  }

  for (const shipId of sunkIds(prev, next)) {
    const other = before ? (shipId === before.attackerId ? before.defenderId : before.attackerId) : null;
    const shooterId = other !== null && (other in next.ships || other in next.npcs) ? other : null;
    beats.push({ kind: "sink", shipId, shooterId, seconds: paced(BEATS.sink.seconds), seedKey: keyOf(`sink:${shipId}`) });
  }

  return beats;
}
