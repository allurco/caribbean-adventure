import { SHELL_FONTS_URL } from "../online/useShellFonts";

/** The map's chart lettering (#239): the online shell's IM Fell small capitals (`--font-fell-sc` in index.css). */
export const MAP_FONT_FAMILY = '"IM Fell English SC", Georgia, serif';
/** Shared with `useShellFonts`, so the stylesheet is added once whichever asks first. */
const LINK_ID = "shell-fonts";
/** How long to wait for the font before drawing in the fallback for good. */
const FONT_TIMEOUT_MS = 4000;

/**
 * Loads IM Fell English SC for drawing on a canvas, where CSS cannot swap it
 * in later: resolves once it has loaded, failed or timed out, so the caller
 * redraws in whatever face there is.
 */
export function loadMapFont(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  if (!document.getElementById(LINK_ID)) {
    const link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    link.href = SHELL_FONTS_URL;
    document.head.appendChild(link);
  }
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
  // The stylesheet's @font-face rules arrive with it, so ask until they have
  const load = (async () => {
    for (let i = 0; i < 20; i++) {
      const faces = await document.fonts.load('64px "IM Fell English SC"').catch(() => []);
      if (faces.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  })();
  return Promise.race([load, timeout]);
}
