import { useEffect, useState } from "react";

/** THROWAWAY PROTOTYPE: two tiny local-state hooks the variants share. */

/** A clock that counts up from `start` seconds, once a second. */
export function useCountUp(start: number): number {
  const [t, setT] = useState(start);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

/** `copied` turns true for two seconds after `copy(text)`; clipboard failures are ignored. */
export function useCopy(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);
  return {
    copied,
    copy: (text) => {
      navigator.clipboard?.writeText(text).catch(() => undefined);
      setCopied(true);
    },
  };
}
