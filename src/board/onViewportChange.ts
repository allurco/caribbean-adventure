/**
 * Calls `onChange` whenever the window resizes or the device turns, and
 * returns the unsubscribe: the `subscribe` that `useSafeAreaInsets` and
 * `usePortraitPhone` hand to `useSyncExternalStore`.
 */
export function onViewportChange(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}
