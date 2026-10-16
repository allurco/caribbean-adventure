/** Releases that grant user activation: a touch `pointerdown` does not, so only the lift counts. */
const GESTURES = ["pointerup", "touchend"] as const;

/**
 * Runs `act` once, on the first tap or click anywhere under `target`, and
 * returns a function that disarms it. Listens in the capture phase so no
 * component's `stopPropagation` hides the gesture.
 */
export function onFirstGesture(target: EventTarget, act: () => void): () => void {
  const options = { capture: true } as const;
  const disarm = () => {
    for (const type of GESTURES) target.removeEventListener(type, fire, options);
  };
  function fire() {
    disarm();
    act();
  }
  for (const type of GESTURES) target.addEventListener(type, fire, options);
  return disarm;
}
