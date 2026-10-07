import { useEffect, useState } from "react";
import { SOUNDS } from "../audio/soundRegistry";
import { masterGain } from "../audio/audioSettings";
import { audioEngine } from "../audio/sharedAudioEngine";
import { useAudioSettings } from "../audio/useAudioSettings";
import { useAudioUnlock } from "../audio/useAudioUnlock";
import { HudSoundControl } from "../board/HudSoundControl";
import { SoundLabRow } from "./SoundLabRow";

/**
 * The sound lab (#73): `?view=sound` lists every registered sound with
 * play/stop, a loop toggle, its volume and its source, so each one is
 * approved by ear before the game uses it. No game, no canvas; the HUD's
 * mute and volume apply here too.
 */
export function SoundLab() {
  useAudioUnlock();
  const [settings] = useAudioSettings();
  const [unlocked, setUnlocked] = useState(audioEngine.isUnlocked());

  // The engine unlocks on the first click; show when that has happened
  useEffect(() => {
    if (unlocked) return;
    const onGesture = () => void audioEngine.unlock().then(() => setUnlocked(audioEngine.isUnlocked()));
    window.addEventListener("click", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("click", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [unlocked]);

  return (
    <div className="relative min-h-screen bg-[#0a1929] text-stone-200 font-body">
      <HudSoundControl />
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-10">
        <h1 className="font-heading text-2xl text-amber-200 tracking-wider">Sound lab</h1>
        <p className="mt-2 text-sm text-stone-400">
          Every sound in <code>src/audio/soundRegistry.ts</code>. Files and credits are listed in <code>NOTICE</code>.{" "}
          {unlocked ? (
            <span className="text-emerald-400">Audio is on.</span>
          ) : (
            <span className="text-amber-400">Audio starts with your first click.</span>
          )}
        </p>
        <ul className="mt-6 flex flex-col gap-3">
          {SOUNDS.map((sound) => (
            <SoundLabRow key={sound.id} sound={sound} masterGain={masterGain(settings)} />
          ))}
        </ul>
      </div>
    </div>
  );
}
