import { useEffect } from "react";
import { installAudioUnlock } from "./audioEngine";
import { audioEngine } from "./sharedAudioEngine";

/** Unlock the shared audio engine on the page's first click or key press. */
export function useAudioUnlock(): void {
  useEffect(() => (audioEngine.isUnlocked() ? undefined : installAudioUnlock(audioEngine)), []);
}
