import { useEffect, useState } from "react";
import { shellLayoutFor, type ShellLayout } from "./shellLayout";

function current(): ShellLayout {
  return shellLayoutFor({ width: window.innerWidth, height: window.innerHeight });
}

/** The shell's layout for the window, kept current as it is resized or turned (#125). */
export function useShellLayout(): ShellLayout {
  const [layout, setLayout] = useState(current);
  useEffect(() => {
    const update = () => setLayout(current());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return layout;
}
