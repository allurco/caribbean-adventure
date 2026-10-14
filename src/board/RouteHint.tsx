/** A small note while a route is selected (#213): how to sail it or let it go. */
export function RouteHint() {
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none">
      <div className="px-3 py-1.5 rounded-md border border-ink/20 text-ink text-xs tracking-wide bg-parchment/90 shadow-[0_4px_10px_rgba(0,0,0,0.4)] font-body">
        Click again or press <kbd className="font-semibold">Enter</kbd> to sail
        <span className="mx-1.5 text-ink/50">·</span>
        <kbd className="font-semibold">Esc</kbd> to cancel
      </div>
    </div>
  );
}
