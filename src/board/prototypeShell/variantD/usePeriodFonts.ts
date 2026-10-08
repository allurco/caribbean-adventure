import { useEffect } from "react";

/**
 * THROWAWAY PROTOTYPE: load variant D's two period faces (IM Fell English
 * for titles, EB Garamond for reading) without touching index.html. The page
 * renders at once in Georgia and swaps when the fonts arrive.
 */
const HREF =
  "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&display=swap";

export function usePeriodFonts(): void {
  useEffect(() => {
    if (document.querySelector(`link[href="${HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = HREF;
    document.head.appendChild(link);
  }, []);
}
