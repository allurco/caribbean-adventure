/**
 * The online views' URLs (#105), in the same `?view=` style as the dev views
 * (`src/board/devUrlParams.ts`): `?view=account` is the signed-in player's own
 * page (or the sign-in form), `?view=profile&id=<uuid>` anyone's public
 * profile. Pure, no React.
 */
import { isUuid } from "./uuid";

export type AccountRoute = { kind: "account" } | { kind: "profile"; id: string | null };

/** The route in `search` (`window.location.search`), or null for any other view. */
export function parseAccountRoute(search: string): AccountRoute | null {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view === "account") return { kind: "account" };
  if (view === "profile") {
    const id = params.get("id");
    return { kind: "profile", id: id !== null && isUuid(id) ? id.toLowerCase() : null };
  }
  return null;
}

/**
 * `?skipLogin=1`: open the local hotseat game without signing in. With a
 * backend configured the root URL is the sign-in screen; this is the
 * temporary way past it while the game is still played locally, until the
 * online entry (#125) gives signed-in players their own way in.
 */
export function skipsLogin(search: string): boolean {
  return new URLSearchParams(search).get("skipLogin") === "1";
}

export function accountPath(): string {
  return "/?view=account";
}

export function profilePath(id: string): string {
  return `/?${new URLSearchParams({ view: "profile", id }).toString()}`;
}
