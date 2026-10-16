/**
 * Which page of the online shell (#125, the "Harbour launcher" of #104) a URL
 * opens. With a backend configured the root URL is the shell's Play screen;
 * the account pages (#105) and the rooms (#112) open inside the shell too.
 * The match board (`?view=match`), the local game (`?skipLogin=1`, or the
 * root URL with the dev parameters of #74) and the dev views stay outside it. Pure, no React.
 */
import { parseDevUrlParams } from "../board/devUrlParams";
import { parseAccountRoute, type AccountRoute } from "./accountRoute";
import { parseOnlineRoute, type OnlineRoute } from "./onlineRoute";

/** The screens that are not built yet and show a "coming" sheet (#117 lobby, #119 party, #121 ranked). */
export type ComingScreen = "lobby" | "party" | "ranked";

export type ShellPage =
  /** `saved`: the player just left an online match, which is saved (`?saved=1`, #301). */
  | { kind: "play"; saved?: true }
  | { kind: "coming"; screen: ComingScreen }
  | AccountRoute
  | Exclude<OnlineRoute, { kind: "match" }>;

const COMING: readonly ComingScreen[] = ["lobby", "party", "ranked"];

/** The shell page in `search` (`window.location.search`), or null when the URL opens something else. */
export function parseShellPage(search: string): ShellPage | null {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view === null) {
    // The root URL is the harbour, whatever else rides on it (the sign-in
    // link's own parameters, a link tracker's). Only `?skipLogin=1` or a dev
    // URL parameter of #74 that actually reads opens the local game.
    if (opensLocalGame(search)) return null;
    return params.get("saved") === "1" ? { kind: "play", saved: true } : { kind: "play" };
  }
  if (view === "play") return { kind: "play" };
  const coming = COMING.find((screen) => screen === view);
  if (coming) return { kind: "coming", screen: coming };
  const account = parseAccountRoute(search);
  if (account) return account;
  const online = parseOnlineRoute(search);
  if (online && online.kind !== "match") return online;
  return null;
}

/** Whether the root URL asks for the local game: `skipLogin`, or a dev parameter `parseDevUrlParams` reads. */
function opensLocalGame(search: string): boolean {
  return new URLSearchParams(search).has("skipLogin") || Object.keys(parseDevUrlParams(search)).length > 0;
}

/**
 * The shell page a link to `href` opens, when the shell can show it in place
 * (same origin, same app path), or null when the link should load a page of
 * its own. An invite link always loads: joining takes a seat.
 */
export function shellPageForHref(href: string, origin: string): ShellPage | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.pathname !== "/") return null;
  const page = parseShellPage(url.search);
  return page && page.kind !== "join" ? page : null;
}

/** The parts of a click the shell's link handling reads. */
export interface ClickFacts {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** The parts of the clicked link the shell's link handling reads: its `target`, and whether it has `download`. */
export interface LinkFacts {
  target: string;
  download: boolean;
}

/**
 * Whether the shell may take a click on a link to move in place: a plain left
 * click, not already handled, on a link with no target and no download. A
 * modified or middle click (new tab, new window, save) stays the browser's.
 */
export function shouldInterceptClick(click: ClickFacts, link: LinkFacts): boolean {
  if (click.defaultPrevented || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  return link.target === "" && !link.download;
}

export function playPath(): string {
  return "/";
}

/** The harbour, the shell's Play: the player's voyages; `saved` after leaving an online match (#301). */
export function harbourPath({ saved = false }: { saved?: boolean } = {}): string {
  return saved ? "/?saved=1" : playPath();
}

export function comingPath(screen: ComingScreen): string {
  return `/?view=${screen}`;
}

/**
 * The local game (solo, or hotseat with dev `?players=`) behind a configured
 * backend: `?skipLogin=1`, as before the shell.
 */
export function localGamePath(): string {
  return "/?skipLogin=1";
}
