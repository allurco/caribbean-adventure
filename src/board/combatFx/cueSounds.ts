/**
 * Which registered sound each combat cue plays (#263). The sounds come from
 * the same cues as the effects (cuePlayer.ts), so they stay in step on every
 * seat. Several takes of a sound (`cannon-shot-1`, `-2`, ...) are chosen by
 * the shot's index, never at random. A sound the registry does not have yet
 * is skipped (the guns fall back to the one cannon sound), so the cues can
 * name sounds before their files land.
 */
import { SOUNDS, type SoundId } from "../../audio/soundRegistry";
import type { CombatCue, CombatCueType } from "./cuePlayer";

const REGISTERED = new Set<string>(SOUNDS.map((s) => s.id));
const isSoundId = (id: string): id is SoundId => REGISTERED.has(id);

/** The registered ids among `candidates`, in order. */
const takes = (...candidates: string[]): SoundId[] => candidates.filter(isSoundId);
const numbered = (stem: string, count: number) => Array.from({ length: count }, (_, i) => `${stem}-${i + 1}`);

const CUE_SOUNDS: Partial<Record<CombatCueType, readonly SoundId[]>> = {
  gunFired: (() => {
    const shots = takes(...numbered("cannon-shot", 8));
    return shots.length > 0 ? shots : takes("cannon-fire");
  })(),
  shotHit: takes(...numbered("wood-crack", 8)),
  shotSplashed: takes(...numbered("ball-splash", 8)),
  mastFalls: takes("mast-crack"),
  grapplesThrown: takes("grapples"),
  hullGroans: takes("hull-groan"),
  shipBreaksUp: takes("ship-breakup"),
};

/** The take for index `i`, cycling through them. */
export function pickVariant<T>(variants: readonly T[], i: number): T | null {
  return variants.length === 0 ? null : variants[((i % variants.length) + variants.length) % variants.length];
}

/** The sound `cue` plays, or null for a silent one. */
export function cueSound(cue: CombatCue): SoundId | null {
  const variants = CUE_SOUNDS[cue.type];
  if (!variants) return null;
  // Each gun along the side gets the next take; the reply starts further along, so the two ships differ.
  return pickVariant(variants, Math.max(0, cue.shot) + 3 * Math.max(0, cue.volley));
}
