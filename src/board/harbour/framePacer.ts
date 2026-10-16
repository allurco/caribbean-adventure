/**
 * Paces the harbour backdrop's frames (#122): its canvas renders on demand,
 * and this decides on which of the display's refreshes it asks for a frame,
 * so the water moves at about `HARBOUR_FPS` whatever the display's rate.
 */

/** The backdrop's frame rate: enough for the swell, half a 60 Hz display's work. */
export const HARBOUR_FPS = 30;

/** How early a refresh may come and still draw, ms: refresh times jitter around the interval. */
const SLACK_MS = 4;

export interface FramePacer {
  /** Whether to draw on the refresh at `nowMs` (a `requestAnimationFrame` time). */
  shouldDraw: (nowMs: number) => boolean;
}

export function createFramePacer(fps: number): FramePacer {
  const interval = 1000 / fps;
  // When the frame now due was due: kept on the interval's grid, so the rate does not drift with the refreshes.
  let due: number | null = null;
  return {
    shouldDraw: (now) => {
      if (due !== null && now < due - SLACK_MS) return false;
      // The first frame, or one after a gap of more than an interval (a hidden tab): start the grid again from now.
      due = due === null || now - due > interval ? now + interval : due + interval;
      return true;
    },
  };
}
