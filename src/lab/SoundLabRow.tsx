import { useEffect, useRef, useState } from "react";
import type { SoundEntry } from "../audio/soundRegistry";
import type { SoundHandle } from "../audio/audioEngine";
import { audioEngine } from "../audio/sharedAudioEngine";

/** How often a row checks whether its one-shot has finished. */
const POLL_MS = 200;

/** One registry sound in the sound lab: play/stop, loop, its base volume and its credit. */
export function SoundLabRow({ sound, masterGain }: { sound: SoundEntry; masterGain: number }) {
  const handle = useRef<SoundHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(sound.loop);
  const [volume, setVolume] = useState(sound.volume);

  // A one-shot ends by itself: notice, so the button flips back to Play
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (handle.current && !handle.current.isPlaying()) setPlaying(false);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [playing]);

  // Stop on unmount
  useEffect(() => () => handle.current?.stop(), []);

  const play = () => {
    handle.current?.stop();
    handle.current = audioEngine.play(sound.id, { loop, volume });
    setPlaying(handle.current !== null);
  };
  const stop = () => {
    handle.current?.stop();
    handle.current = null;
    setPlaying(false);
  };
  const changeLoop = (next: boolean) => {
    setLoop(next);
    handle.current?.setLoop(next);
  };
  const changeVolume = (next: number) => {
    setVolume(next);
    handle.current?.setVolume(next);
  };

  return (
    <li className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-1.5 p-4 rounded-lg border border-amber-800/30 bg-stone-900/70">
      <button
        type="button"
        onClick={playing ? stop : play}
        className={`row-span-3 self-center font-heading py-2 rounded-md text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors border ${
          playing
            ? "bg-amber-600 hover:bg-amber-500 text-stone-950 border-amber-400"
            : "bg-amber-900/60 hover:bg-amber-800/80 text-amber-200 border-amber-700/40"
        }`}
      >
        {playing ? "Stop" : "Play"}
      </button>

      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-amber-100 font-semibold">{sound.label}</span>
        <code className="text-amber-500/70 text-xs">{sound.id}</code>
        <span className="text-stone-400 text-xs uppercase tracking-widest">{sound.kind}</span>
        <code className="text-stone-500 text-xs">public/sounds/{sound.file}</code>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-stone-300">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={loop} onChange={(e) => changeLoop(e.target.checked)} className="accent-amber-500" />
          Loop
        </label>
        <label className="flex items-center gap-2">
          Base volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="w-28 accent-amber-500 cursor-pointer"
          />
          <span className="tabular-nums text-amber-200">{volume.toFixed(2)}</span>
          {volume !== sound.volume && <span className="text-stone-500">(registry {sound.volume.toFixed(2)})</span>}
        </label>
        <span className="tabular-nums text-stone-400">heard at {(volume * masterGain).toFixed(2)}</span>
      </div>

      <p className="text-xs text-stone-400">
        "{sound.credit.title}" by {sound.credit.author}, {sound.credit.licence},{" "}
        <a href={sound.credit.url} target="_blank" rel="noreferrer" className="text-amber-400/80 hover:text-amber-300 underline">
          source
        </a>
        {sound.credit.changes && <span className="text-stone-500"> · {sound.credit.changes}</span>}
      </p>
    </li>
  );
}
