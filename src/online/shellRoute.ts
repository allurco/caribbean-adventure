/**
 * Which page of the online shell (#125, the "Harbour launcher" of #104) a URL
 * opens. With a backend configured the root URL is the shell's Play screen;
 * the account pages (#105) and the rooms (#112) open inside the shell too.
 * The match board (`?view=match`), the local game (`?skipLogin=1`, or the
 * root URL with the dev parameters of #74) and the dev views stay outside it. Pure, no React.
 */
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

/** What Supabase Auth may add to the URL a sign-in link returns to. */
const SIGN_IN_RETURN_PARAMS: ReadonlySet<string> = new Set(["code", "error", "error_code", "error_description"]);

const COMING: readonly ComingScreen[] = ["lobby", "party", "ranked"];

/** The shell page in `search` (`window.location.search`), or null when the URL opens something else. */
export function parseShellPage(search: string): ShellPage | null {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view === null) {
    // The bare root URL, the sign-in link coming back to it, or a match left
    // for the harbour. Anything else there (`?skipLogin=1`, the dev URL
    // parameters of #74) opens the local game.
    if (![...params.keys()].every((key) => key === "saved" || SIGN_IN_RETURN_PARAMS.has(key))) return null;
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
