import { useEffect } from "react";

/** Fell and Garamond (#104), with `display=swap` so text paints at once in the fallback face. */
export const SHELL_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&display=swap";

const LINK_ID = "shell-fonts";

/**
 * Loads the online shell's fonts once, when an online page first mounts. Added
 * after first paint and never by the hotseat game, so neither waits on them.
 */
export function useShellFonts(): void {
  useEffect(() => {
    if (document.getElementById(LINK_ID)) return;
    const link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    link.href = SHELL_FONTS_URL;
    document.head.appendChild(link);
  }, []);
}
