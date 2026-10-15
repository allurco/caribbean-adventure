import type { ReactNode } from "react";
import type { AccountClient } from "./accountClient";
import { SignInForm } from "./SignInForm";
import { SHEET, TIMBER_FRAME } from "./shellStyles";

/**
 * The shell's sign-in screen (#125): the whole harbour, the game's name over
 * it, and one parchment card in a timber frame with #105's email sign-in.
 * Discord and Google (#106) join the card above an "or by email" rule; on a
 * phone held sideways the two halves sit side by side and centre themselves,
 * so a card taller than the screen scrolls from its top.
 */
export function ShellSignIn({ client }: { client: AccountClient }) {
  return (
    <SignInLayout>
      <h2 className="font-fell text-[28px] leading-tight short-landscape:text-[23px]">Sign in to sail</h2>
      <p className="mb-5 text-[15px] text-shell-ink-soft short-landscape:mb-2.5">Your matches wait for you on any device.</p>
      <SignInForm client={client} />
    </SignInLayout>
  );
}

function SignInLayout({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col gap-6 overflow-y-auto px-4 pt-10 pb-10 md:flex-row md:items-end md:justify-between md:p-12 short-landscape:flex-row short-landscape:items-start short-landscape:justify-between short-landscape:py-3 short-landscape:pr-[max(16px,env(safe-area-inset-right))] short-landscape:pl-[max(28px,env(safe-area-inset-left))]">
      <div className="md:mb-4 md:max-w-[52%] short-landscape:my-auto short-landscape:max-w-[46%]">
        <p className="font-fell-sc text-[22px] leading-none text-shell-sail-dim [text-shadow:0_2px_10px_rgba(0,0,0,0.7)] md:text-[30px] short-landscape:text-[20px]">
          Project
        </p>
        <h1 className="font-fell text-[64px] leading-[0.85] text-shell-sail italic [text-shadow:0_4px_18px_rgba(0,0,0,0.65)] md:text-[112px] short-landscape:text-[64px]">
          Caribbean
        </h1>
        <p className="mt-3 max-w-[34ch] font-garamond text-[18px] text-shell-sail-soft italic [text-shadow:0_1px_6px_rgba(0,0,0,0.8)] md:text-[21px] short-landscape:text-[16px]">
          Up to four captains, one sea. Trade, raid and race for glory over a few days or a single evening.
        </p>
      </div>
      <div className={`${TIMBER_FRAME} mt-auto w-full shrink-0 md:mt-0 md:w-[400px] short-landscape:my-auto short-landscape:w-[340px] short-landscape:p-2`}>
        <section aria-label="Sign in" className={`${SHEET} px-6 py-6 short-landscape:px-5 short-landscape:py-3.5`}>
          {children}
        </section>
      </div>
    </div>
  );
}
