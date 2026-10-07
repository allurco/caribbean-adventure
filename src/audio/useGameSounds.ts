import { useEffect, useRef } from "react";
import type { CaribbeanState } from "../game/types";
import { soundEventsFrom } from "./soundEvents";
import { soundsForEvents } from "./eventSounds";
import { audioEngine } from "./sharedAudioEngine";

/** Play the sounds for each change of `G` (silent until the first gesture unlocks audio). */
export function useGameSounds(G: CaribbeanState): void {
  const prev = useRef<CaribbeanState | undefined>(undefined);
  useEffect(() => {
    const sounds = soundsForEvents(soundEventsFrom(prev.current, G));
    prev.current = G;
    for (const id of sounds) audioEngine.play(id);
  }, [G]);
}
