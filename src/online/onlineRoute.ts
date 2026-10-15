/**
 * The online play views' URLs (#112), in the `?view=` style of
 * `accountRoute.ts`: `?view=rooms` to create a room, `?view=room&id=<uuid>` a
 * room's lobby, and `?view=join&invite=<code>` the invite link a host shares.
 * Pure; the server builds the invite link with `joinPath` too.
 */
import { isUuid } from "./uuid";

export type OnlineRoute =
  | { kind: "newRoom" }
  | { kind: "room"; id: string | null }
  | { kind: "join"; inviteCode: string | null };

/** 128 random bits, base64url: what the server issues (`newInviteCode`). */
const INVITE_CODE = /^[A-Za-z0-9_-]{22}$/;

/** The route in `search` (`window.location.search`), or null for any other view. */
export function parseOnlineRoute(search: string): OnlineRoute | null {
  const params = new URLSearchParams(search);
  switch (params.get("view")) {
    case "rooms":
      return { kind: "newRoom" };
    case "room": {
      const id = params.get("id");
      return { kind: "room", id: id !== null && isUuid(id) ? id.toLowerCase() : null };
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

export function roomPath(id: string): string {
  return `/?${new URLSearchParams({ view: "room", id }).toString()}`;
}

export function joinPath(inviteCode: string): string {
  return `/?${new URLSearchParams({ view: "join", invite: inviteCode }).toString()}`;
}
