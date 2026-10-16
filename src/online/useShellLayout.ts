import { useEffect, useState } from "react";
import { partyDockFits, shellLayoutFor, type ShellLayout } from "./shellLayout";

/** The shell's layout for the window, and whether the desktop party board fits under the nav board. */
export interface ShellFit {
  layout: ShellLayout;
  partyDock: boolean;
}

function current(): ShellFit {
  const size = { width: window.innerWidth, height: window.innerHeight };
  return { layout: shellLayoutFor(size), partyDock: partyDockFits(size) };
}

/** The shell's fit for the window, kept current as it is resized or turned (#125). */
export function useShellLayout(): ShellFit {
  const [fit, setFit] = useState(current);
  useEffect(() => {
    const update = () =>
      setFit((prev) => {
        const next = current();
        return next.layout === prev.layout && next.partyDock === prev.partyDock ? prev : next;
      });
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return fit;
}
