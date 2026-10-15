/**
 * Save & leave (#300): top left beside the sound control. The hotseat game
 * is saved and the start screen shown, where the voyage can be continued.
 */
export function HudSaveLeave({ onSaveAndLeave }: { onSaveAndLeave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSaveAndLeave}
      className="font-heading absolute top-12 left-[13rem] px-3 py-1.5 bg-black/40 hover:bg-amber-900/50 rounded-lg border border-amber-700/30 backdrop-blur-sm text-amber-200/90 hover:text-amber-100 text-[11px] uppercase tracking-wider cursor-pointer transition-colors"
    >
      Save &amp; leave
    </button>
  );
}
