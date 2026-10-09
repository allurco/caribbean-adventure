import { createAmbienceBed } from "./ambienceBed";
import { audioEngine } from "./sharedAudioEngine";

/** The page's one ambience bed, played by the game board and the sound lab. */
export const ambienceBed = createAmbienceBed(audioEngine);
