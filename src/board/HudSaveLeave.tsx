import { HUD_SAVE_LEAVE_HEIGHT, HUD_SAVE_LEAVE_LEFT, HUD_SAVE_LEAVE_WIDTH, HUD_STACK_TOP } from "./hudLayout";

/**
 * Save & leave (#300): top left beside the sound control. The hotseat game
 * is saved and the start screen shown, where the voyage can be continued.
 */
export function HudSaveLeave({ onSaveAndLeave }: { onSaveAndLeave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSaveAndLeave}
      className="font-heading absolute flex whitespace-nowrap items-center justify-center px-3 bg-black/40 hover:bg-amber-900/50 rounded-lg border border-amber-700/30 backdrop-blur-sm text-amber-200/90 hover:text-amber-100 text-[11px] uppercase tracking-wider cursor-pointer transition-colors"
      style={{ top: HUD_STACK_TOP, left: HUD_SAVE_LEAVE_LEFT, width: HUD_SAVE_LEAVE_WIDTH, height: HUD_SAVE_LEAVE_HEIGHT }}
    >
      Save &amp; leave
    </button>
  );
}
