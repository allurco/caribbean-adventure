import { useEffect, useRef } from "react";
import { fightPlayedOut } from "./fightPlayed";

/**
 * Calls `onPlayed(key)` once the fight has played out (`fightPlayedOut`):
 * `holding` watched each frame from the frame after `key` was set, up to
 * `capMs`. A new key starts a new watch; null watches nothing.
 */
export function useWhenFightPlayed<K>(key: K | null, holding: () => boolean, capMs: number, onPlayed: (key: K) => void): void {
  const latest = useRef({ holding, onPlayed });
  useEffect(() => {
    latest.current = { holding, onPlayed };
  });
  useEffect(() => {
    if (key === null) return;
    const since = performance.now();
    let frameCount = 0;
    let frame = requestAnimationFrame(function tick(now) {
      frameCount += 1;
      if (!fightPlayedOut({ frame: frameCount, elapsedMs: now - since, holding: latest.current.holding(), capMs })) {
        frame = requestAnimationFrame(tick);
        return;
      }
      latest.current.onPlayed(key);
    });
    return () => cancelAnimationFrame(frame);
  }, [key, capMs]);
}
