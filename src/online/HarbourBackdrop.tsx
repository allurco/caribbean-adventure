import { HarbourStill } from "./HarbourStill";

/**
 * The harbour behind the whole shell (#122, the backdrop of #104's "Harbour
 * launcher"): the still captured from the harbour's fixed camera, over its
 * inlined blurred copy (HarbourStill), and a soft vignette. The app shows
 * this same backdrop while the shell's chunk loads, so it is the very first
 * frame. No live scene (#418): nothing on the shell's pages draws in WebGL,
 * so a software or weak GPU never holds the menus up.
 */
export function HarbourBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-shell-harbour">
      <HarbourStill />
      {/* a soft vignette so the boards read over bright water */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_45%_50%,transparent_45%,rgba(5,12,18,0.55))]" />
    </div>
  );
}
