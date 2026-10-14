/**
 * Class strings of the online shell's surfaces and controls (#104 "Harbour
 * launcher"), built on the `shell-*` and font tokens in `src/index.css`, so
 * the shell (#125) and later screens reuse them rather than restating them.
 */
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shell-gold";
const PRESS =
  "cursor-pointer transition-[transform,box-shadow] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50";

/** Brass plate: the main action on any screen. */
export const BTN_BRASS = `${FOCUS} ${PRESS} inline-flex items-center justify-center gap-2 px-5 py-2.5 font-fell-sc text-[17px] leading-none text-shell-ink rounded-[3px] border border-[#5c3f15] bg-[linear-gradient(180deg,#ecd08a,#c39448_55%,#8c6526)] shadow-[inset_0_1px_0_rgba(255,246,214,0.75),0_3px_0_#4a3210,0_6px_14px_rgba(0,0,0,0.35)] hover:brightness-110 active:shadow-[inset_0_1px_0_rgba(255,246,214,0.6),0_1px_0_#4a3210]`;

/** Ink-ruled button on parchment: secondary actions. */
export const BTN_INK = `${FOCUS} ${PRESS} inline-flex items-center justify-center gap-1.5 px-3 py-1 font-garamond text-[15px] font-semibold text-shell-ink rounded-[3px] border border-[#5b3f22] bg-[#efe3c2] shadow-[0_2px_0_#5b3f22] hover:bg-[#f6ecd2] active:shadow-none`;

/** A text field on parchment. */
export const INPUT =
  "block w-full rounded-[2px] border border-[#7a5c3a]/60 bg-[#f4ead0] px-3 py-2 font-garamond text-[16px] text-shell-ink placeholder:text-[#8a7458] outline-none focus:border-[#8a6a33] focus:ring-2 focus:ring-shell-gold/60";

/** A field's label on parchment. */
export const LABEL = "mb-1 block font-garamond text-[15px] text-shell-ink-soft";

/** A link in running text on parchment. */
export const LINK = `${FOCUS} text-shell-ink underline decoration-shell-brass underline-offset-2 hover:text-shell-ink-wax`;

/** The timber frame round a sheet. */
export const TIMBER_FRAME =
  "rounded-[4px] border-2 border-shell-tar bg-shell-timber bg-[linear-gradient(180deg,rgba(255,220,160,0.07),rgba(0,0,0,0.35))] p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]";

/** The parchment sheet itself: foxed at the edges. */
export const PARCHMENT_SHEET =
  "rounded-[2px] bg-shell-parchment bg-[radial-gradient(ellipse_at_25%_10%,rgba(255,250,228,0.55),transparent_55%),radial-gradient(ellipse_at_90%_100%,rgba(120,72,24,0.28),transparent_50%)] shadow-[inset_0_0_70px_rgba(116,68,22,0.42),inset_0_0_14px_rgba(84,46,12,0.45)] font-garamond text-shell-ink";
