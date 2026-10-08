import { useState } from "react";
import type { VariantProps } from "../../shellKeys";
import { BTN_BRASS, FELL, FELL_SC, FOCUS_RING, GARAMOND, INK_SOFT, PARCHMENT, TIMBER_H } from "../theme";

const PROVIDER = `${GARAMOND} ${FOCUS_RING} w-full py-2.5 rounded-[3px] text-[17px] font-semibold cursor-pointer active:translate-y-[2px]`;

/** THROWAWAY PROTOTYPE: variant D, sign in. The whole harbour, and one parchment card in a timber frame. */
export function DSignIn({ go }: VariantProps) {
  const [email, setEmail] = useState("");
  return (
    <div className="absolute inset-0 overflow-y-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-4 pt-10 pb-28 md:p-12 phl:flex-row phl:items-start phl:justify-between phl:py-3 phl:pl-[max(28px,env(safe-area-inset-left))] phl:pr-[max(16px,env(safe-area-inset-right))]">
      {/* sideways on a phone both halves centre with auto margins, so a card taller than the screen scrolls from its top instead of clipping it */}
      <div className="md:max-w-[52%] md:mb-4 phl:my-auto phl:max-w-[46%]">
        <div className={`${FELL_SC} text-[22px] md:text-[30px] phl:text-[20px] text-[#f3e3b6] leading-none [text-shadow:0_2px_10px_rgba(0,0,0,0.7)]`}>Caribbean</div>
        <h1 className={`${FELL} italic text-[64px] md:text-[112px] phl:text-[72px] leading-[0.85] text-[#fbefcf] [text-shadow:0_4px_18px_rgba(0,0,0,0.65)]`}>Merchant</h1>
        <p className={`${GARAMOND} italic text-[18px] md:text-[21px] phl:text-[16px] text-[#f6ead0] mt-3 max-w-[34ch] [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]`}>
          Six captains, one sea. Trade, raid and race for glory over a few days or a single evening.
        </p>
      </div>

      <div style={TIMBER_H} className="w-full md:w-[400px] phl:w-[340px] shrink-0 mt-auto md:mt-0 phl:my-auto p-2.5 phl:p-2 rounded-[4px] border-2 border-[#1c120a] shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
        <div style={PARCHMENT} className={`${GARAMOND} px-6 py-6 phl:px-5 phl:py-3.5 rounded-[2px]`}>
          <h2 className={`${FELL} text-[28px] phl:text-[23px] text-[#2b1d10] leading-tight`}>Sign in to sail</h2>
          <p className={`text-[15px] ${INK_SOFT} mb-5 phl:mb-2.5`}>Your matches wait for you on any device.</p>
          {/* sideways on a phone the two providers share a row, named by brand alone */}
          <div className="space-y-2.5 phl:space-y-0 phl:grid phl:grid-cols-2 phl:gap-2">
            <button onClick={() => go("home")} className={`${PROVIDER} bg-[#5865f2] text-white border border-[#3c45a5] shadow-[0_3px_0_#3c45a5] hover:bg-[#6873f4]`}>
              <span className="phl:hidden">Continue with </span>Discord
            </button>
            <button onClick={() => go("home")} className={`${PROVIDER} bg-[#fbf8f0] text-[#2b2b2b] border border-[#8a7c60] shadow-[0_3px_0_#8a7c60] hover:bg-white`}>
              <span className="phl:hidden">Continue with </span>Google
            </button>
          </div>
          <div className={`flex items-center gap-3 my-5 phl:my-2 text-[15px] italic ${INK_SOFT}`}>
            <span className="h-px flex-1 bg-[#7a5c3a]/40" />
            or by email
            <span className="h-px flex-1 bg-[#7a5c3a]/40" />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) go("home");
            }}
          >
            <label htmlFor="d-email" className={`block text-[15px] ${INK_SOFT} mb-1`}>
              Email address
            </label>
            <input
              id="d-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-[#f4ead0] border border-[#7a5c3a]/60 rounded-[2px] px-3 py-2 text-[16px] text-[#2b1d10] placeholder:text-[#8a7458] outline-none focus:border-[#8a6a33] focus:ring-2 focus:ring-[#e6c77e]/60"
            />
            <button className={`${BTN_BRASS} w-full mt-3 phl:mt-2.5 !py-3 phl:!py-2.5`}>Email me a sign-in link</button>
          </form>
          <p className={`text-[13px] ${INK_SOFT} mt-4 phl:mt-2.5 leading-snug`}>You must be 13 or older. Other players see only your display name and seal.</p>
        </div>
      </div>
    </div>
  );
}
