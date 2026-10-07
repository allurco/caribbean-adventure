import { createAudioEngine } from "./audioEngine";
import type { SettingsStorage } from "./audioSettings";

/** localStorage, or nothing where reading it throws (blocked site data). */
function browserStorage(): SettingsStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** The page's one audio engine, shared by the game board, the HUD and the sound lab. */
export const audioEngine = createAudioEngine(browserStorage(), import.meta.env.BASE_URL);
