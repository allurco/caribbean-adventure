/**
 * Plays the combat timeline (#263): the beats one after another, each
 * beat's moments (cues) handed out as their time comes. One player feeds
 * both the effects (combatDirector.ts) and the sounds (cueSounds.ts), so
 * the flash of a gun and its report come from the same cue on the same
 * frame. Pure, no three.js; advancing allocates nothing.
 */
import type { CombatBeat } from "./combatTimeline";

export type CombatCueType =
  /** The beat begins: ships set off on their courses, the camera frames the fight. */
  | "beatStart"
  | "gunFired"
  | "shotHit"
  | "shotSplashed"
  | "mastFalls"
  | "grapplesThrown"
  | "fleeEnded"
  | "hullGroans"
  | "shipBreaksUp"
  | "shipGone";

export interface CombatCue {
  readonly type: CombatCueType;
  /** Seconds from the beat's start. */
  readonly at: number;
  readonly beat: CombatBeat;
  /** For a volley's cues: which ship's broadside, and which of its shots. */
  readonly volley: number;
  readonly shot: number;
  /** The player's clock when the beat began; set as it starts. */
  beatStartedAt: number;
}

/** Share of the beat at which the grapples fly, the flight shows its end, and the sinking ship breaks up. */
export const GRAPPLES_AT = 0.55;
export const FLEE_ENDS_AT = 0.7;
export const BREAKS_UP_AT = 0.45;

/** A beat's cues, in the order they play. */
export function cuesOf(beat: CombatBeat): CombatCue[] {
  const cues: CombatCue[] = [];
  const cue = (type: CombatCueType, at: number, volley = -1, shot = -1) => cues.push({ type, at, beat, volley, shot, beatStartedAt: 0 });
  cue("beatStart", 0);
  switch (beat.kind) {
    case "volley":
      beat.volleys.forEach((v, vi) => {
        v.shots.forEach((s, si) => {
          cue("gunFired", s.fireAt, vi, si);
          cue(s.hit ? "shotHit" : "shotSplashed", s.landAt, vi, si);
        });
        if (v.mastFalls) {
          const lastHit = v.shots.filter((s) => s.hit).reduce((t, s) => Math.max(t, s.landAt), 0);
          cue("mastFalls", lastHit, vi);
        }
      });
      break;
    case "closeAlongside":
      cue("grapplesThrown", beat.seconds * GRAPPLES_AT);
      break;
    case "flee":
      cue("fleeEnded", beat.seconds * FLEE_ENDS_AT);
      break;
    case "sink":
      cue("hullGroans", 0);
      cue("shipBreaksUp", beat.seconds * BREAKS_UP_AT);
      cue("shipGone", beat.seconds);
      break;
    case "declare":
      break;
  }
  // Stable: cues at the same moment keep the order they were made in.
  return cues.map((c, i) => ({ c, i })).sort((a, b) => a.c.at - b.c.at || a.i - b.i).map(({ c }) => c);
}

export interface CuePlayer {
  enqueue: (beats: readonly CombatBeat[]) => void;
  /** Moves the clock on by `dt` s and returns the cues now due, in order (the array is reused: read it before the next call). */
  advance: (dt: number) => readonly CombatCue[];
  /** A beat playing or waiting. */
  busy: () => boolean;
  time: () => number;
  /** Drops everything queued and playing. */
  clear: () => void;
}

export function createCuePlayer(): CuePlayer {
  let now = 0;
  const queue: CombatCue[][] = [];
  let playing: CombatCue[] | null = null;
  let next = 0;
  let endsAt = 0;
  const due: CombatCue[] = [];

  return {
    enqueue: (beats) => {
      for (const beat of beats) queue.push(cuesOf(beat));
    },
    advance: (dt) => {
      now += dt;
      due.length = 0;
      for (;;) {
        if (!playing) {
          const cues = queue.shift();
          if (!cues) break;
          // A beat starts when the last one ended, or now if the table was quiet.
          const startedAt = Math.min(now, Math.max(endsAt, now - dt));
          for (const c of cues) c.beatStartedAt = startedAt;
          playing = cues;
          next = 0;
          endsAt = startedAt + cues[0].beat.seconds;
        }
        while (next < playing.length && playing[next].beatStartedAt + playing[next].at <= now) due.push(playing[next++]);
        if (next < playing.length || now < endsAt) break;
        playing = null;
      }
      return due;
    },
    busy: () => playing !== null || queue.length > 0,
    time: () => now,
    clear: () => {
      queue.length = 0;
      playing = null;
    },
  };
}
