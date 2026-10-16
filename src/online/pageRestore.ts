/**
 * When Back brings a page out of the browser's back-forward cache, its
 * scripts resume with the state they had as the page left, such as a sign-in
 * button still reading "Opening Discord…". `pageshow` with `persisted` set is
 * that moment. Returns the unsubscribe.
 */
export function onPageRestored(page: EventTarget, restored: () => void): () => void {
  const listener = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) restored();
  };
  page.addEventListener("pageshow", listener);
  return () => page.removeEventListener("pageshow", listener);
}
