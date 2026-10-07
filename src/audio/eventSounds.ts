import type { SoundEvent, SoundEventType } from "./soundEvents";
import type { SoundId } from "./soundRegistry";

/**
 * Which registered sound each event plays (#73). Events left out are
 * silent until a later slice gives them a sound (docking, sinking, combat
 * start, NPC movement, ...).
 */
const EVENT_SOUNDS: Partial<Record<SoundEventType, SoundId>> = {
  shipSailed: "ship-wash",
  goodsBought: "coins",
  goodsSold: "coins",
  upgradeBought: "coins",
  shipRepaired: "coins",
  shipBought: "coins",
  goldStashed: "coins",
  cannonsFired: "cannon-fire",
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
