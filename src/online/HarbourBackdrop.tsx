/**
 * The harbour behind the whole shell (#125). For now deep water and a
 * vignette, so the boards read; #122 paints the harbour here: the captured
 * still at first paint, then the lightened live scene fading in once it has
 * settled. The shell mounts this once, at the same place in the tree on every
 * screen, and swaps only the sheet, so the scene #122 puts here survives
 * screen changes without remounting.
 */
export function HarbourBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-shell-harbour">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_45%,var(--color-shell-sea),var(--color-shell-harbour)_75%)]" />
      {/* a soft vignette so the boards read over bright water */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_45%_50%,transparent_45%,rgba(5,12,18,0.55))]" />
    </div>
  );
}
