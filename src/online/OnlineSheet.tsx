import type { ReactNode } from "react";
import { PARCHMENT_SHEET, TIMBER_FRAME } from "./shellStyles";
import { useShellFonts } from "./useShellFonts";

interface OnlineSheetProps {
  title: string;
  /** A line under the title, in soft ink. */
  subtitle?: string;
  children: ReactNode;
}

/**
 * A stand-in frame for the online pages (#105): one parchment sheet in a
 * timber frame on tar. The Harbour launcher shell (#125) replaces this frame
 * with its own (nav board, nameboard, harbour) and keeps what goes inside.
 */
export function OnlineSheet({ title, subtitle, children }: OnlineSheetProps) {
  useShellFonts();
  return (
    <main className="flex h-full w-full overflow-y-auto bg-shell-tar bg-[radial-gradient(ellipse_at_50%_30%,#2a1b10,var(--color-shell-tar)_70%)] px-4 py-8">
      <div className="m-auto w-full max-w-[440px]">
        <div className={TIMBER_FRAME}>
          <section aria-labelledby="online-sheet-title" className={`${PARCHMENT_SHEET} px-6 py-6`}>
            <h1 id="online-sheet-title" className="font-fell text-[28px] leading-tight">
              {title}
            </h1>
            {subtitle && <p className="mt-1 text-[15px] text-shell-ink-soft">{subtitle}</p>}
            <div className="mt-5 space-y-5 text-[16px]">{children}</div>
          </section>
        </div>
        <p className="mt-5 text-center">
          <a
            href="/"
            className="font-fell-sc text-[15px] text-shell-gold underline decoration-shell-gold/50 underline-offset-2 hover:text-shell-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shell-gold"
          >
            Back to the game
          </a>
        </p>
      </div>
    </main>
  );
}
