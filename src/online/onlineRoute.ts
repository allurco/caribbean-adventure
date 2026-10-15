/**
 * The online play views' URLs (#112), in the `?view=` style of
 * `accountRoute.ts`: `?view=rooms` the harbour (the player's voyages, and a new room;
 * `&saved=1` after leaving a match), `?view=room&id=<uuid>` a
 * room's lobby, `?view=join&invite=<code>` the invite link a host shares, and
 * `?view=match&id=<uuid>` a started match, played from the seat's own board (#113).
 * Pure; the server builds the invite link with `joinPath` too.
 */
import { isUuid } from "./uuid";

export type OnlineRoute =
  /** `saved`: the player just left a match, which is saved (`?saved=1`). */
  | { kind: "newRoom"; saved?: true }
  | { kind: "room"; id: string | null }
  | { kind: "join"; inviteCode: string | null }
  | { kind: "match"; id: string | null };

/** 128 random bits, base64url: what the server issues (`newInviteCode`). */
const INVITE_CODE = /^[A-Za-z0-9_-]{22}$/;

/** The route in `search` (`window.location.search`), or null for any other view. */
export function parseOnlineRoute(search: string): OnlineRoute | null {
  const params = new URLSearchParams(search);
  switch (params.get("view")) {
    case "rooms":
      return params.get("saved") === "1" ? { kind: "newRoom", saved: true } : { kind: "newRoom" };
    case "room": {
      const id = params.get("id");
      return { kind: "room", id: id !== null && isUuid(id) ? id.toLowerCase() : null };
    }
    case "match": {
      const id = params.get("id");
      return { kind: "match", id: id !== null && isUuid(id) ? id.toLowerCase() : null };
    }
    case "join": {
      const code = params.get("invite");
      return { kind: "join", inviteCode: code !== null && INVITE_CODE.test(code) ? code : null };
    }
    default:
      return null;
  }
}

export function newRoomPath(): string {
  return "/?view=rooms";
}

/** The harbour (`?view=rooms`): the player's voyages and a new room; `saved` after leaving a match. */
export function harbourPath({ saved = false }: { saved?: boolean } = {}): string {
  return saved ? "/?view=rooms&saved=1" : newRoomPath();
}

export function roomPath(id: string): string {
  return `/?${new URLSearchParams({ view: "room", id }).toString()}`;
}

export function joinPath(inviteCode: string): string {
  return `/?${new URLSearchParams({ view: "join", invite: inviteCode }).toString()}`;
}

export function matchPath(id: string): string {
  return `/?${new URLSearchParams({ view: "match", id }).toString()}`;
}
