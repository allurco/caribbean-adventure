import { Audio, AudioListener, AudioLoader, FileLoader, PositionalAudio } from "three";
import type { Object3D } from "three";
import {
  type AudioSettings,
  type SettingsStorage,
  loadAudioSettings,
  masterGain,
  saveAudioSettings,
} from "./audioSettings";
import { type SoundId, soundById, soundUrl } from "./soundRegistry";

/**
 * The three.js side of sound (#73): one `AudioListener` (on the camera when
 * there is one), buffers loaded on first use, and registry sounds played by
 * id. Browsers refuse audio before a user gesture, so nothing here touches
 * an AudioContext until `unlock()`, which must run inside one (see
 * `installAudioUnlock`); until then `play` is a silent no-op.
 */
export interface AudioEngine {
  /**
   * Create and resume the audio context; call from a user gesture. Resolves
   * once the browser has answered: a gesture that is not a user activation
   * (a touch pointerdown, Escape) leaves the context suspended.
   */
  unlock(): Promise<void>;
  /** True once the audio context is actually running. */
  isUnlocked(): boolean;
  /** Carry the listener on `object` (the camera); returns a detach function. */
  attachTo(object: Object3D): () => void;
  /**
   * Download a registered sound's file ahead of its first play (the loading
   * screen waits on every sound, sceneAssets.ts). Only the bytes: decoding
   * needs the audio context, so it waits for the first play after unlock.
   */
  prefetch(id: SoundId): Promise<void>;
  /** Play a registered sound; null while locked. */
  play(id: SoundId, options?: PlayOptions): SoundHandle | null;
  getSettings(): AudioSettings;
  setSettings(settings: AudioSettings): void;
  /** Called after every settings change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export interface PlayOptions {
  /** Loop instead of the registry's flag. */
  loop?: boolean;
  /** Base volume instead of the registry's, 0..1 (before the master volume). */
  volume?: number;
  /**
   * Where in the world the sound comes from (#263): heard from that point
   * relative to the listener on the camera, panned and fading with distance.
   * Without it the sound plays flat, as from the listener.
   */
  at?: readonly [number, number, number];
}

/**
 * How a placed sound fades with distance, in world units: full within the
 * distance of a close ship zoom, then gently, so a fight seen from the
 * map's zoom is quieter but still heard.
 */
export const POSITIONAL_REF_DISTANCE = 4;
export const POSITIONAL_ROLLOFF = 0.6;

export interface SoundHandle {
  stop(): void;
  isPlaying(): boolean;
  setVolume(volume: number): void;
  setLoop(loop: boolean): void;
}

export function createAudioEngine(storage: SettingsStorage | undefined, base: string): AudioEngine {
  let settings = loadAudioSettings(storage);
  let listener: AudioListener | null = null;
  let host: Object3D | null = null;
  const buffers = new Map<SoundId, Promise<AudioBuffer>>();
  const subscribers = new Set<() => void>();
  const loader = new AudioLoader();
  const files = new FileLoader().setResponseType("arraybuffer");
  const prefetched = new Map<SoundId, ArrayBuffer>();

  const decode = (id: SoundId): Promise<AudioBuffer> => {
    const bytes = prefetched.get(id);
    // decodeAudioData detaches the buffer it is given, so it gets a copy
    if (bytes && listener) return listener.context.decodeAudioData(bytes.slice(0));
    return loader.loadAsync(soundUrl(soundById(id), base));
  };

  const buffer = (id: SoundId): Promise<AudioBuffer> => {
    let pending = buffers.get(id);
    if (!pending) {
      pending = decode(id);
      // Let a failed load be retried next time
      pending.catch(() => buffers.delete(id));
      buffers.set(id, pending);
    }
    return pending;
  };

  return {
    unlock() {
      if (!listener) {
        listener = new AudioListener();
        listener.setMasterVolume(masterGain(settings));
        host?.add(listener);
      }
      if (listener.context.state === "running") return Promise.resolve();
      return listener.context.resume().catch(() => undefined);
    },

    isUnlocked: () => listener?.context.state === "running",

    async prefetch(id) {
      if (prefetched.has(id)) return;
      const bytes = await files.loadAsync(soundUrl(soundById(id), base));
      if (bytes instanceof ArrayBuffer) prefetched.set(id, bytes);
    },

    attachTo(object) {
      host = object;
      if (listener) object.add(listener);
      return () => {
        if (listener) object.remove(listener);
        if (host === object) host = null;
      };
    },

    play(id, options = {}) {
      if (!listener) return null;
      const entry = soundById(id);
      const audio = options.at ? placedAudio(listener, options.at) : new Audio(listener);
      let stopped = false;
      // A first play waits on its buffer; it counts as playing meanwhile
      let loading = true;
      audio.setLoop(options.loop ?? entry.loop);
      audio.setVolume(options.volume ?? entry.volume);

      buffer(id)
        .then((data) => {
          loading = false;
          if (stopped) return;
          audio.setBuffer(data);
          audio.play();
          // Free the nodes once a one-shot (or a stopped loop) is done
          audio.source?.addEventListener("ended", () => audio.gain.disconnect());
          if (import.meta.env.DEV) console.info(`[audio] play ${id} (context ${listener?.context.state})`);
        })
        .catch((error: unknown) => {
          loading = false;
          console.warn(`[audio] could not load ${id}`, error);
        });

      return {
        stop() {
          if (stopped) return;
          stopped = true;
          // Stopping a playing source fires "ended", which frees the nodes
          if (audio.isPlaying) audio.stop();
          else audio.gain.disconnect();
        },
        isPlaying: () => !stopped && (loading || audio.isPlaying),
        setVolume: (volume) => void audio.setVolume(volume),
        setLoop: (loop) => void audio.setLoop(loop),
      };
    },

    getSettings: () => settings,

    setSettings(next) {
      settings = next;
      saveAudioSettings(storage, settings);
      listener?.setMasterVolume(masterGain(settings));
      for (const notify of subscribers) notify();
    },

    subscribe(notify) {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
  };
}

/** A sound placed at `at` in the world: its panner set once from there (it does not move). */
function placedAudio(listener: AudioListener, at: readonly [number, number, number]): PositionalAudio {
  const audio = new PositionalAudio(listener);
  audio.setDistanceModel("inverse");
  audio.setRefDistance(POSITIONAL_REF_DISTANCE);
  audio.setRolloffFactor(POSITIONAL_ROLLOFF);
  // Not in the scene, and still: the panner is placed directly, once.
  const panner = audio.panner;
  const t = listener.context.currentTime;
  panner.positionX.setValueAtTime(at[0], t);
  panner.positionY.setValueAtTime(at[1], t);
  panner.positionZ.setValueAtTime(at[2], t);
  return audio;
}

/**
 * Unlock `engine` on the page's gestures (in a game, the draft pick), which
 * browsers require before audio may start. Not every gesture counts: a touch
 * pointerdown or an Escape keydown leaves the context suspended, so the
 * handlers stay until it is running. Returns a function that removes them.
 */
export function installAudioUnlock(engine: AudioEngine, target: EventTarget = window): () => void {
  const events = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
  const options = { capture: true };
  const remove = () => events.forEach((type) => target.removeEventListener(type, onGesture, options));
  function onGesture() {
    void engine.unlock().then(() => {
      if (engine.isUnlocked()) remove();
    });
  }
  events.forEach((type) => target.addEventListener(type, onGesture, options));
  return remove;
}
