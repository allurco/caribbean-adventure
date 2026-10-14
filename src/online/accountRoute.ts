/**
 * The online views' URLs (#105), in the same `?view=` style as the dev views
 * (`src/board/devUrlParams.ts`): `?view=account` is the signed-in player's own
 * page (or the sign-in form), `?view=profile&id=<uuid>` anyone's public
 * profile. Pure, no React.
 */
export type AccountRoute = { kind: "account" } | { kind: "profile"; id: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The route in `search` (`window.location.search`), or null for any other view. */
export function parseAccountRoute(search: string): AccountRoute | null {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view === "account") return { kind: "account" };
  if (view === "profile") {
    const id = params.get("id");
    return { kind: "profile", id: id !== null && UUID.test(id) ? id.toLowerCase() : null };
  }
  return null;
}

export function accountPath(): string {
  return "/?view=account";
}

export function profilePath(id: string): string {
  return `/?${new URLSearchParams({ view: "profile", id }).toString()}`;
}
