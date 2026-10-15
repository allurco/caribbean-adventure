import type { SoundEvent, SoundEventType } from "./soundEvents";
import type { SoundId } from "./soundRegistry";

/**
 * Which registered sound each event plays (#73). Events left out are
 * silent until a later slice gives them a sound (docking, combat start, NPC
 * movement, ...). The fight's guns, hits, splashes, grapples and sinkings
 * play from the combat timeline's cues instead (board/combatFx/cueSounds.ts,
 * #263), in step with what the board shows.
 */
const EVENT_SOUNDS: Partial<Record<SoundEventType, SoundId>> = {
  shipSailed: "ship-wash",
  goodsBought: "coins",
  goodsSold: "coins",
  upgradeBought: "coins",
  shipRepaired: "coins",
  shipBought: "coins",
  goldStashed: "coins",
  pirateBountyClaimed: "coins",
  // TODO(#201): turnedPirate stays silent until the registry has a fitting
  // sound (a bell or a shanty sting); none of the current ones suits it.
};

export function soundForEvent(event: SoundEvent): SoundId | null {
  return EVENT_SOUNDS[event.type] ?? null;
}

/** The sounds for one state change, each once, in the order their events came. */
export function soundsForEvents(events: readonly SoundEvent[]): SoundId[] {
  const sounds: SoundId[] = [];
  for (const event of events) {
    const sound = soundForEvent(event);
    if (sound && !sounds.includes(sound)) sounds.push(sound);
  }
  return sounds;
}
