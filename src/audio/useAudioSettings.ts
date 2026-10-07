import { useSyncExternalStore } from "react";
import type { AudioSettings } from "./audioSettings";
import { audioEngine } from "./sharedAudioEngine";

/** The shared mute and volume, and a setter that applies and saves them. */
export function useAudioSettings(): [AudioSettings, (settings: AudioSettings) => void] {
  const settings = useSyncExternalStore(audioEngine.subscribe, audioEngine.getSettings);
  return [settings, audioEngine.setSettings];
}
