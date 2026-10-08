import type { CSSProperties } from "react";

/**
 * THROWAWAY PROTOTYPE — Variant D tokens: B's launcher structure dressed in
 * A's harbour. Tarred timber for the frame, parchment for the page, brass
 * for what you press, wax red only for "it is your turn".
 *
 * Palette
 *   tar        #1c120a  frame shadows, slate
 *   timber     #3b2616  rail, dock, tab bar
 *   parchment  #e5d4a9  the content sheet
 *   ink        #2b1d10  text on parchment
 *   brass      #b98b3e  primary buttons, active marks
 *   wax        #8a2617  your-turn urgency only
 *   verdigris  #5f9a86  crew / online
 */

/** Two period faces: Fell (a seventeenth-century press type) for names and titles, Garamond for reading. */
export const FELL = "font-['IM_Fell_English',Georgia,serif]";
export const FELL_SC = "font-['IM_Fell_English_SC',Georgia,serif]";
export const GARAMOND = "font-['EB_Garamond',Georgia,serif]";

const grain = (freq: string, alpha: number, rgb = "0.22 0.13 0.05") =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${rgb.split(" ")[0]} 0 0 0 0 ${rgb.split(" ")[1]} 0 0 0 0 ${rgb.split(" ")[2]} 0 0 0 ${alpha} 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

/** Vertical-grain planks: the nav board. */
export const TIMBER_V: CSSProperties = {
  backgroundColor: "#3b2616",
  backgroundImage: [
    grain("0.9 0.012", 0.55, "0.08 0.04 0.01"),
    "repeating-linear-gradient(90deg, transparent 0 74px, rgba(0,0,0,0.45) 74px 76px, rgba(255,214,150,0.05) 76px 77px)",
    "linear-gradient(90deg, rgba(0,0,0,0.35), rgba(255,220,160,0.05) 45%, rgba(0,0,0,0.4))",
  ].join(","),
};

/** Horizontal-grain planks: nameboard, party board, tab bar. */
export const TIMBER_H: CSSProperties = {
  backgroundColor: "#3b2616",
  backgroundImage: [
    grain("0.012 0.9", 0.55, "0.08 0.04 0.01"),
    "linear-gradient(180deg, rgba(255,220,160,0.07), rgba(0,0,0,0.35))",
  ].join(","),
};

/** The content sheet: foxed at the edges, grain all over. */
export const PARCHMENT: CSSProperties = {
  backgroundColor: "#e5d4a9",
  backgroundImage: [
    grain("0.75", 0.28),
    "radial-gradient(ellipse at 25% 10%, rgba(255,250,228,0.55), transparent 55%)",
    "radial-gradient(ellipse at 90% 100%, rgba(120,72,24,0.28), transparent 50%)",
  ].join(","),
  boxShadow: "inset 0 0 70px rgba(116,68,22,0.42), inset 0 0 14px rgba(84,46,12,0.45), 0 22px 50px rgba(0,0,0,0.55), 0 2px 0 rgba(0,0,0,0.4)",
};

/** A darker inset of parchment for a sub-panel on the sheet (settings, timers). */
export const PARCHMENT_INSET = "bg-[#d6c08c]/70 shadow-[inset_0_1px_4px_rgba(70,40,10,0.35)] rounded-[3px]";

/** Chalk slate for chat. */
export const SLATE = "bg-[#1f2427] border-[6px] border-[#2a1a0e] shadow-[inset_0_0_30px_rgba(0,0,0,0.6)]";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e6c77e]";
const PRESS = "cursor-pointer transition-[transform,box-shadow] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed";

/** Brass plate: the main action on any screen. */
export const BTN_BRASS = `${FELL_SC} ${FOCUS} ${PRESS} inline-flex items-center justify-center gap-2 px-5 py-2 text-[17px] leading-none text-[#2b1d10] rounded-[3px] border border-[#5c3f15] bg-[linear-gradient(180deg,#ecd08a,#c39448_55%,#8c6526)] shadow-[inset_0_1px_0_rgba(255,246,214,0.75),0_3px_0_#4a3210,0_6px_14px_rgba(0,0,0,0.35)] hover:brightness-110 active:shadow-[inset_0_1px_0_rgba(255,246,214,0.6),0_1px_0_#4a3210]`;

/** Wax red: reserved for taking your turn. */
export const BTN_WAX = `${FELL_SC} ${FOCUS} ${PRESS} inline-flex items-center justify-center gap-2 px-6 py-2.5 text-[19px] leading-none text-[#fbe9d0] rounded-[3px] border border-[#3f0d06] bg-[linear-gradient(180deg,#b23a24,#8a2617_60%,#651a0f)] shadow-[inset_0_1px_0_rgba(255,200,170,0.45),0_3px_0_#3f0d06,0_8px_18px_rgba(60,10,0,0.45)] hover:brightness-110 active:shadow-[inset_0_1px_0_rgba(255,200,170,0.3),0_1px_0_#3f0d06]`;

/** Ink-ruled button on parchment. */
export const BTN_INK = `${GARAMOND} ${FOCUS} ${PRESS} inline-flex items-center justify-center gap-1.5 px-3 py-1 text-[15px] font-semibold text-[#2b1d10] rounded-[3px] border border-[#5b3f22] bg-[#efe3c2] shadow-[0_2px_0_#5b3f22] hover:bg-[#f6ecd2] active:shadow-none`;

/** Dark button on timber. */
export const BTN_TIMBER = `${GARAMOND} ${FOCUS} ${PRESS} inline-flex items-center justify-center gap-1.5 px-3 py-1 text-[15px] font-semibold text-[#ecdcae] rounded-[3px] border border-[#8a6a33]/80 bg-[#24160b] shadow-[0_2px_0_#0d0703] hover:bg-[#2f1d0f] active:shadow-none`;

/** Small italic heading for a section on the sheet. */
export const SECTION = `${FELL} italic text-[19px] text-[#4a3220]`;

export const INK_SOFT = "text-[#5c4630]";
export const RULE = "border-[#7a5c3a]/35";
export const FOCUS_RING = FOCUS;
