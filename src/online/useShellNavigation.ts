import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { parseShellPage, shellPageForHref, type ShellPage } from "./shellRoute";

/**
 * The shell's page, moved between without a reload (#125): a click on a link
 * to another shell page swaps the sheet and pushes the URL, Back and Forward
 * follow it, so the frame and the harbour behind it (#122) stay mounted.
 * Links that leave the shell (the match board, the local game) load as
 * pages. Spread `onClick` on the shell's root.
 */
export function useShellNavigation(initial: ShellPage): { page: ShellPage; onClick: (event: MouseEvent) => void } {
  const [page, setPage] = useState(initial);

  useEffect(() => {
    const onPop = () => setPage(parseShellPage(window.location.search) ?? { kind: "play" });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const onClick = useCallback((event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const next = shellPageForHref(anchor.href, window.location.origin);
    if (!next) return;
    event.preventDefault();
    if (anchor.href !== window.location.href) window.history.pushState(null, "", anchor.href);
    setPage(next);
  }, []);

  return { page, onClick };
}
