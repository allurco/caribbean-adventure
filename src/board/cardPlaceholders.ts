/**
 * The event cards' placeholder art (#247), until the painted WebP images
 * land (cardArtSlots.ts): a small engraving per card, in ink, brass, wax
 * red and sea teal on parchment, the palette of
 * docs/art/event-card-prompts.md. Each picture follows its card's prompt
 * (a sloop on a calm sea, two flutes before a port, a frigate under a
 * squall, …) with the top of the frame left clear for the title, as the
 * art will be. Plain shapes in a 300 × 400 frame, drawn by
 * `EventCardArtPlaceholder`; no text. Pure.
 */
import { CARD_ART, type CardArtSlot, type FlagBox } from "./cardArtSlots";

export const PLACEHOLDER_FRAME = { width: 300, height: 400 } as const;

export type PlaceholderShape =
  | { kind: "path"; d: string; fill?: string; stroke?: string; width?: number; opacity?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; width?: number; opacity?: number };

const PAPER = "#e5d4a9";
/** The parchment's light and its foxed edge, also the placeholder's ground (`EventCardArtPlaceholder`). */
export const PAPER_LIGHT = "#f3e3b6";
export const PAPER_DARK = "#d2bb85";
const INK = "#2b1d10";
const INK_SOFT = "#5c4630";
const BRASS = "#b98b3e";
const WAX = "#8a2617";
const SEA = "#2f5d62";

const W = PLACEHOLDER_FRAME.width;
const H = PLACEHOLDER_FRAME.height;

const n = (v: number) => String(Math.round(v * 10) / 10);

const path = (d: string, style: Omit<Extract<PlaceholderShape, { kind: "path" }>, "kind" | "d">): PlaceholderShape => ({ kind: "path", d, ...style });

/** The sea below `horizon`: a teal wash and engraved lines, spaced wider towards the viewer. */
function sea(horizon: number): PlaceholderShape[] {
  const lines: string[] = [];
  for (let i = 0, y = horizon + 5; y < H; i++, y += 4 + i * 1.6) {
    // Broken strokes, offset row by row, like a burin's cuts
    const offset = (i * 37) % 60;
    for (let x = -offset; x < W; x += 60) {
      const end = Math.min(W, x + 38 + (i % 3) * 6);
      if (end > 0) lines.push(`M${n(Math.max(0, x))} ${n(y)} H${n(end)}`);
    }
  }
  return [
    path(`M0 ${horizon} H${W} V${H} H0 Z`, { fill: SEA, opacity: 0.2 }),
    path(lines.join(" "), { stroke: SEA, width: 0.9, opacity: 0.6 }),
    path(`M0 ${horizon} H${W}`, { stroke: INK, width: 1 }),
  ];
}

/** Sky hatching above `horizon`, finer than the sea's, fading upwards. */
function sky(horizon: number): PlaceholderShape {
  const lines: string[] = [];
  for (let y = horizon - 6, i = 0; y > horizon - 70; y -= 5 + i, i++) lines.push(`M0 ${n(y)} H${W}`);
  return path(lines.join(" "), { stroke: BRASS, width: 0.6, opacity: 0.35 });
}

interface ShipSpec {
  /** Where the hull meets the water, mid-ships. */
  x: number;
  y: number;
  /** Scale: 1 is a hull 96 units long. */
  s: number;
  /** 1 with the bow to the right, -1 to the left. */
  dir: 1 | -1;
  sails: "full" | "slack" | "reefed";
  hull?: string;
  sail?: string;
  gunports?: boolean;
}

/** A ship in profile: hull, two masts and their sails. */
function ship({ x, y, s, dir, sails, hull = INK, sail = PAPER_LIGHT, gunports = false }: ShipSpec): PlaceholderShape[] {
  const p = (lx: number, ly: number) => `${n(x + dir * lx * s)} ${n(y + ly * s)}`;
  const bulge = sails === "slack" ? 2 : 9;
  const top = sails === "reefed" ? -76 : -100;
  const mainSail = `M${p(-22, top)} Q${p(4, top + 6)} ${p(30, top)} Q${p(30 + bulge, (top - 36) / 2)} ${p(30, -36)} Q${p(4, -30)} ${p(-22, -36)} Q${p(-22 + bulge, (top - 36) / 2)} ${p(-22, top)} Z`;
  const foreTop = sails === "reefed" ? -62 : -84;
  const foreSail = `M${p(18, foreTop)} L${p(44, foreTop)} Q${p(44 + bulge, (foreTop - 40) / 2)} ${p(46, -40)} L${p(16, -40)} Q${p(16 + bulge, (foreTop - 40) / 2)} ${p(18, foreTop)} Z`;
  const shapes: PlaceholderShape[] = [
    path(`M${p(4, -14)} L${p(4, -118)} M${p(30, -14)} L${p(30, -94)} M${p(48, -18)} L${p(70, -34)}`, { stroke: INK, width: 1.6 * s }),
    path(mainSail, { fill: sail, stroke: INK, width: 1.1 }),
    path(foreSail, { fill: sail, stroke: INK, width: 1.1 }),
    path(`M${p(-46, -26)} L${p(-32, -26)} L${p(-28, -14)} L${p(40, -14)} L${p(52, -20)} Q${p(44, 2)} ${p(26, 6)} L${p(-30, 6)} Q${p(-44, 0)} ${p(-46, -26)} Z`, {
      fill: hull,
      stroke: INK,
      width: 1,
    }),
    path(`M${p(-40, 6)} Q${p(0, 12)} ${p(40, 5)}`, { stroke: PAPER_LIGHT, width: 1.2, opacity: 0.8 }),
  ];
  if (gunports) {
    const ports = [-20, -8, 4, 16, 28].map((lx) => `M${p(lx, -10)} h${n(4 * s * dir)} v${n(4 * s)} h${n(-4 * s * dir)} Z`);
    shapes.push(path(ports.join(" "), { fill: BRASS }));
  }
  return shapes;
}

/** The staff a tinted flag flies from: up to a little above the flag's hoist, down to `foot`. */
function flagStaff(box: FlagBox, foot: number): PlaceholderShape {
  const x = box.x * W;
  const y = box.y * H;
  return path(`M${n(x)} ${n(y - 6)} V${n(foot)}`, { stroke: INK, width: 2.2 });
}

/** A flagged card's flag box, from the table (only ever asked of the two that fly one). */
function boxOf(slot: CardArtSlot): FlagBox {
  const flag = CARD_ART[slot].flag;
  if (!flag) throw new Error(`${slot} flies no flag`);
  return flag.box;
}

const gulls = path("M118 150 q6 -6 12 0 q6 -6 12 0 M158 128 q4 -4 8 0 q4 -4 8 0 M96 176 q5 -5 10 0 q5 -5 10 0", { stroke: INK, width: 1.1 });

function calmSeas(): PlaceholderShape[] {
  return [
    sky(250),
    { kind: "circle", cx: 222, cy: 236, r: 30, fill: BRASS, opacity: 0.35, stroke: BRASS, width: 1.2 },
    ...sea(250),
    path("M14 250 Q42 226 70 236 Q86 230 104 250 Z", { fill: INK_SOFT, opacity: 0.6 }),
    path("M52 234 Q50 214 56 204 M56 204 q-12 -2 -16 6 M56 204 q12 -4 16 4 M56 204 q-4 -10 -12 -10 M56 204 q6 -10 14 -8", { stroke: INK_SOFT, width: 1.2 }),
    gulls,
    ...ship({ x: 150, y: 296, s: 0.95, dir: 1, sails: "slack" }),
  ];
}

function merchantConvoy(): PlaceholderShape[] {
  return [
    sky(244),
    ...sea(244),
    // The port behind: terracotta roofs and a stone tower
    path("M198 244 V226 H214 V244 M216 244 V230 H232 V244 M234 244 V222 H252 V244 M256 244 V198 H268 V244", { fill: PAPER_DARK, stroke: INK, width: 0.9 }),
    path("M196 226 L206 216 L216 226 Z M214 230 L224 220 L234 230 Z M232 222 L243 211 L254 222 Z M254 198 L262 188 L270 198 Z", { fill: WAX, stroke: INK, width: 0.8 }),
    ...ship({ x: 218, y: 268, s: 0.62, dir: 1, sails: "full" }),
    ...ship({ x: 112, y: 300, s: 1, dir: 1, sails: "full" }),
    // Crates and barrels lashed on deck
    path("M86 280 h10 v-9 h-10 Z M100 280 h10 v-11 h-10 Z M128 280 h9 v-8 h-9 Z", { fill: BRASS, stroke: INK, width: 0.8 }),
  ];
}

function storm(): PlaceholderShape[] {
  return [
    path("M0 60 Q40 40 80 62 Q110 30 160 54 Q200 26 240 56 Q280 44 300 66 V170 Q250 186 200 172 Q150 192 100 174 Q50 190 0 172 Z", { fill: INK, opacity: 0.82 }),
    path("M30 176 l-18 70 M60 180 l-18 70 M90 178 l-18 70 M200 178 l-18 70 M230 174 l-18 70 M260 178 l-18 70 M290 172 l-18 70", { stroke: INK_SOFT, width: 1, opacity: 0.7 }),
    path("M168 188 L244 184 L230 300 L172 300 Z", { fill: PAPER_LIGHT, opacity: 0.45 }),
    path("M120 150 L104 196 L118 194 L100 240 L136 184 L122 186 L138 150 Z", { fill: BRASS, stroke: INK, width: 1 }),
    ...sea(256),
    path("M0 300 L20 284 L36 300 L60 280 L80 300 L104 282 L124 300 M176 300 L200 280 L222 300 L246 284 L268 300 L300 282", { fill: PAPER_LIGHT, stroke: INK, width: 1 }),
    ...ship({ x: 160, y: 318, s: 0.95, dir: -1, sails: "reefed" }),
  ];
}

function flotillaPatrol(): PlaceholderShape[] {
  const box = boxOf("flotillaPatrol");
  return [
    sky(250),
    ...sea(250),
    // A headland fort behind
    path("M0 250 V214 Q30 204 54 214 L66 230 L80 250 Z", { fill: INK_SOFT, opacity: 0.7 }),
    path("M8 214 V200 h8 v6 h6 v-6 h8 v6 h6 v-6 h8 V212", { fill: PAPER_DARK, stroke: INK, width: 0.8 }),
    ...ship({ x: 222, y: 264, s: 0.72, dir: -1, sails: "full", gunports: true }),
    ...ship({ x: 110, y: 290, s: 1.25, dir: -1, sails: "full", gunports: true }),
    flagStaff(box, 290 - 26 * 1.25),
  ];
}

function npcPirate(): PlaceholderShape[] {
  return [
    sky(254),
    ...sea(254),
    // The rocky cove she slips out of
    path("M0 120 Q30 110 46 150 Q70 170 74 220 Q86 250 96 300 L0 300 Z", { fill: INK_SOFT, opacity: 0.85 }),
    path("M12 160 l18 10 M20 200 l26 8 M8 240 l30 10", { stroke: INK, width: 1, opacity: 0.7 }),
    ...ship({ x: 176, y: 300, s: 0.95, dir: -1, sails: "full", hull: INK, sail: PAPER_DARK }),
    // The black flag at the masthead, its skull pale
    path("M172 188 h-30 q4 8 0 18 h30 Z", { fill: INK, stroke: INK, width: 1 }),
    { kind: "circle", cx: 158, cy: 196, r: 4, fill: PAPER_LIGHT },
    // Lanterns along the rail
    { kind: "circle", cx: 140, cy: 280, r: 2.6, fill: BRASS },
    { kind: "circle", cx: 196, cy: 280, r: 2.6, fill: BRASS },
  ];
}

function clemency(): PlaceholderShape[] {
  return [
    // The cabin window, the harbour beyond at golden hour
    path("M86 220 V130 Q150 70 214 130 V220 Z", { fill: BRASS, opacity: 0.3, stroke: INK, width: 2 }),
    path("M86 190 H214 M150 104 V220 M88 160 H212", { stroke: INK, width: 1.4 }),
    path("M90 206 H210 M96 212 H200 M104 217 H196", { stroke: SEA, width: 0.9, opacity: 0.7 }),
    // The sea chest
    path("M46 330 V262 Q150 240 254 262 V330 Z", { fill: INK_SOFT, stroke: INK, width: 1.2 }),
    path("M46 280 Q150 258 254 280 M96 252 V330 M204 252 V330", { stroke: BRASS, width: 2 }),
    // A coiled rope
    { kind: "circle", cx: 222, cy: 250, r: 16, stroke: BRASS, width: 3 },
    { kind: "circle", cx: 222, cy: 250, r: 9, stroke: BRASS, width: 3 },
    // The pardon: a scroll, its ribbon and a wax-red seal
    path("M72 250 L196 232 Q206 236 204 246 L80 264 Q70 262 72 250 Z", { fill: PAPER_LIGHT, stroke: INK, width: 1.1 }),
    path("M130 242 L134 268 M140 240 L150 264", { stroke: WAX, width: 2.4 }),
    { kind: "circle", cx: 136, cy: 248, r: 13, fill: WAX, stroke: INK, width: 1 },
    { kind: "circle", cx: 136, cy: 248, r: 7.5, stroke: PAPER, width: 1, opacity: 0.6 },
  ];
}

function lostFlag(): PlaceholderShape[] {
  const box = boxOf("lostFlag");
  return [
    sky(300),
    ...sea(300),
    // The fort's rampart, crenellated, its stones cut in
    path("M18 300 V232 h18 v-12 h16 v12 h22 v-12 h16 v12 h22 v-12 h16 v12 h22 v-12 h16 v12 h22 v-12 h16 v12 h22 v-12 h16 v12 h22 V300 Z", {
      fill: PAPER_DARK,
      stroke: INK,
      width: 1.1,
    }),
    path("M18 250 H282 M18 268 H282 M18 286 H282 M60 232 V250 M120 250 V268 M180 232 V250 M240 250 V268 M90 268 V286 M210 268 V286", {
      stroke: INK_SOFT,
      width: 0.8,
    }),
    // Cannon smoke drifting across
    { kind: "circle", cx: 218, cy: 214, r: 16, fill: PAPER_LIGHT, stroke: INK_SOFT, width: 0.8, opacity: 0.85 },
    { kind: "circle", cx: 244, cy: 206, r: 12, fill: PAPER_LIGHT, stroke: INK_SOFT, width: 0.8, opacity: 0.85 },
    { kind: "circle", cx: 196, cy: 222, r: 10, fill: PAPER_LIGHT, stroke: INK_SOFT, width: 0.8, opacity: 0.85 },
    // The old flag, faded and torn, falling from its broken staff: the loser's, never named, so never coloured
    path("M80 232 L72 176", { stroke: INK, width: 2 }),
    path("M72 178 L44 196 L52 202 L40 214 L56 216 L50 226 L78 206 Z", { fill: PAPER_DARK, stroke: INK_SOFT, width: 0.9 }),
    // The new one rising (its cloth is the tinted layer)
    flagStaff(box, 232),
  ];
}

function back(): PlaceholderShape[] {
  const cx = W / 2;
  const cy = H / 2;
  const rhumbs: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    rhumbs.push(`M${n(cx)} ${n(cy)} L${n(cx + Math.cos(a) * 240)} ${n(cy + Math.sin(a) * 240)}`);
  }
  const point = (angle: number, length: number, half: 1 | -1) => {
    const tip = [cx + Math.cos(angle) * length, cy + Math.sin(angle) * length];
    const side = [cx + Math.cos(angle + (half * Math.PI) / 4) * length * 0.16, cy + Math.sin(angle + (half * Math.PI) / 4) * length * 0.16];
    return `M${n(cx)} ${n(cy)} L${n(tip[0])} ${n(tip[1])} L${n(side[0])} ${n(side[1])} Z`;
  };
  const star = (length: number, offset: number) => {
    const dark: string[] = [];
    const light: string[] = [];
    for (let i = 0; i < 4; i++) {
      const a = offset + (i * Math.PI) / 2 - Math.PI / 2;
      dark.push(point(a, length, 1));
      light.push(point(a, length, -1));
    }
    return [path(light.join(" "), { fill: PAPER_LIGHT, stroke: INK, width: 0.9 }), path(dark.join(" "), { fill: BRASS, stroke: INK, width: 0.9 })];
  };
  return [
    path(rhumbs.join(" "), { stroke: INK_SOFT, width: 0.6, opacity: 0.35 }),
    path(`M14 14 H${W - 14} V${H - 14} H14 Z`, { stroke: BRASS, width: 2.4 }),
    path(`M21 21 H${W - 21} V${H - 21} H21 Z`, { stroke: INK_SOFT, width: 0.8, opacity: 0.7 }),
    { kind: "circle", cx, cy, r: 78, stroke: BRASS, width: 2 },
    { kind: "circle", cx, cy, r: 70, stroke: INK_SOFT, width: 0.8 },
    ...star(62, Math.PI / 4),
    ...star(100, 0),
    { kind: "circle", cx, cy, r: 6, fill: WAX, stroke: INK, width: 0.8 },
  ];
}

const ART: Readonly<Record<CardArtSlot, () => PlaceholderShape[]>> = {
  calmSeas,
  merchantConvoy,
  storm,
  flotillaPatrol,
  npcPirate,
  clemency,
  lostFlag,
  back,
};

/** The placeholder engraving for `slot`, back to front. */
export function placeholderArt(slot: CardArtSlot): PlaceholderShape[] {
  return ART[slot]();
}
