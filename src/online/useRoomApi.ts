import { useMemo } from "react";
import type { AccountClient } from "./accountClient";
import { accessToken } from "./accountService";
import { createRoomApi, type ApiDeps, type RoomApi } from "./roomApi";

/** The browser's `fetch` and the signed-in player's token, for the `/api` clients. */
export function useApiDeps(client: AccountClient): ApiDeps {
  return useMemo(() => ({ fetch: (url, init) => window.fetch(url, init), accessToken: () => accessToken(client) }), [client]);
}

/** The rooms API as the signed-in player. */
export function useRoomApi(client: AccountClient): RoomApi {
  const deps = useApiDeps(client);
  return useMemo(() => createRoomApi(deps), [deps]);
}
