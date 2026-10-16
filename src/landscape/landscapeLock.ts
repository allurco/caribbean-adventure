/**
 * Android's half of landscape-only phones (#123): go full screen, then lock
 * the screen to landscape. Chrome grants the lock only in full screen, and
 * both need a user gesture. iOS Safari has neither API on iPhone, so every
 * step is feature-checked and every failure swallowed: the rotate gate is
 * the fallback, and nothing ever waits on this.
 *
 * The browser comes in through `LockPorts` so the rules can be tested;
 * `browserLockPorts()` builds them from `document` and `screen`.
 */

/** The parts of the browser the lock uses; a missing method is a missing API. */
export interface LockPorts {
  fullscreenEnabled: boolean;
  /** `document.fullscreenElement`: anything but null means already full screen. */
  fullscreenElement: unknown;
  requestFullscreen?: () => Promise<void> | void;
  lockOrientation?: (orientation: "landscape") => Promise<void>;
}

/** True where both APIs exist (Android Chrome); false on iOS and on desktop Safari. */
export function canLockLandscape(ports: LockPorts): boolean {
  return ports.fullscreenEnabled && typeof ports.requestFullscreen === "function" && typeof ports.lockOrientation === "function";
}

/** Full screen, then lock to landscape. Resolves true if the lock took; never throws. Call from a user gesture. */
export async function lockLandscape(ports: LockPorts): Promise<boolean> {
  if (!canLockLandscape(ports)) return false;
  try {
    if (ports.fullscreenElement === null) await ports.requestFullscreen?.();
    await ports.lockOrientation?.("landscape");
    return true;
  } catch {
    return false;
  }
}

/** Whether this browser can lock the screen to landscape: `canLockLandscape` over `browserLockPorts()`. */
export function browserCanLockLandscape(): boolean {
  return canLockLandscape(browserLockPorts());
}

/** `ScreenOrientation.lock` is missing from TypeScript's DOM types, and from Safari. */
type LockableOrientation = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };

/** This browser's ports, read now. Empty (nothing to lock) outside a browser. */
export function browserLockPorts(): LockPorts {
  if (typeof document === "undefined" || typeof screen === "undefined") {
    return { fullscreenEnabled: false, fullscreenElement: null };
  }
  const root = document.documentElement;
  const orientation = screen.orientation as LockableOrientation | undefined;
  return {
    fullscreenEnabled: document.fullscreenEnabled === true,
    fullscreenElement: document.fullscreenElement ?? null,
    requestFullscreen: typeof root.requestFullscreen === "function" ? () => root.requestFullscreen({ navigationUI: "hide" }) : undefined,
    lockOrientation: typeof orientation?.lock === "function" ? (o) => orientation.lock!(o) : undefined,
  };
}
