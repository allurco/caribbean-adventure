import { useEffect } from "react";
import { SCREENS, VARIANTS, type Screen, type VariantKey } from "./shellKeys";

interface PrototypeSwitcherProps {
  variant: VariantKey;
  screen: Screen;
  onCycleVariant: (step: number) => void;
  onScreen: (screen: Screen) => void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/**
 * Prototype chrome, deliberately not part of any design: a high-contrast
 * pill, bottom-centre. ← / → (buttons or arrow keys) cycle variants; the
 * second row picks the screen.
 */
export function PrototypeSwitcher({ variant, screen, onCycleVariant, onScreen }: PrototypeSwitcherProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") onCycleVariant(-1);
      if (e.key === "ArrowRight") onCycleVariant(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCycleVariant]);

  const current = VARIANTS.find((v) => v.key === variant)!;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-1.5 font-mono text-[11px] text-black shadow-[0_0_0_2px_#ff00aa,0_8px_24px_rgba(0,0,0,0.5)] max-w-[calc(100vw-16px)]">
      <div className="flex items-center gap-1">
        <button onClick={() => onCycleVariant(-1)} className="rounded-full px-2 py-0.5 hover:bg-black/10 cursor-pointer" aria-label="Previous variant">
          ←
        </button>
        <span className="min-w-44 text-center font-bold">
          {current.key} — {current.name}
        </span>
        <button onClick={() => onCycleVariant(1)} className="rounded-full px-2 py-0.5 hover:bg-black/10 cursor-pointer" aria-label="Next variant">
          →
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-0.5">
        {SCREENS.map((s) => (
          <button
            key={s}
            onClick={() => onScreen(s)}
            className={`rounded-full px-2 py-0.5 cursor-pointer ${s === screen ? "bg-black text-white" : "hover:bg-black/10"}`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
