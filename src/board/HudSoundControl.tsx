import { useAudioSettings } from "../audio/useAudioSettings";
import { audioEngine } from "../audio/sharedAudioEngine";

/**
 * Mute toggle and master volume, top left under the turn bar (#73), clear
 * of the boardgame.io debug panel on the right. Saved per browser.
 */
export function HudSoundControl() {
  const [settings, setSettings] = useAudioSettings();
  const silent = settings.muted || settings.volume === 0;

  const toggleMute = () => {
    setSettings({ ...settings, muted: !settings.muted });
    // Confirms the unmute; muted, the click is silent anyway
    audioEngine.play("ui-click");
  };

  return (
    <div className="absolute top-12 left-5 flex items-center gap-2 px-2.5 py-1.5 bg-black/40 rounded-lg border border-amber-700/30 backdrop-blur-sm">
      <button
        type="button"
        onClick={toggleMute}
        aria-label={settings.muted ? "Unmute sound" : "Mute sound"}
        aria-pressed={settings.muted}
        title={settings.muted ? "Unmute" : "Mute"}
        className="flex items-center justify-center w-6 h-6 rounded text-amber-300/90 hover:text-amber-200 hover:bg-amber-800/40 cursor-pointer transition-colors"
      >
        <SpeakerIcon silent={silent} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={settings.volume}
        onChange={(e) => setSettings({ muted: false, volume: Number(e.target.value) })}
        aria-label="Volume"
        className={`w-20 h-1 cursor-pointer accent-amber-500 ${settings.muted ? "opacity-40" : ""}`}
      />
      <span className="w-7 text-right text-amber-200/70 text-[10px] tabular-nums">
        {settings.muted ? "off" : Math.round(settings.volume * 100)}
      </span>
    </div>
  );
}

function SpeakerIcon({ silent }: { silent: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
      {silent ? (
        <path d="m16 9 5 6m0-6-5 6" />
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      )}
    </svg>
  );
}
