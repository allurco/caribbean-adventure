import { safeInset } from "./safeArea";

/**
 * A small note while a route is selected (#213): how to sail it or let it go.
 * `top` is the hint band's (`hudHintTop`). `warning`: ending the turn at the
 * route's end would cost hull on the open sea (#340).
 */
export function RouteHint({ top, warning }: { top: number; warning?: string | null }) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ top: safeInset("top", top) }}>
      <div className="px-3 py-1.5 rounded-md border border-ink/20 text-ink text-xs tracking-wide bg-parchment/90 shadow-[0_4px_10px_rgba(0,0,0,0.4)] font-body">
        Click again or press <kbd className="font-semibold">Enter</kbd> to sail
        <span className="mx-1.5 text-ink/50">·</span>
        <kbd className="font-semibold">Esc</kbd> to cancel
        {warning && <div className="mt-1 text-center text-red-900 font-semibold">{warning}</div>}
      </div>
    </div>
  );
}
