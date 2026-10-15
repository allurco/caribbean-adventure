import type { AccountClient } from "./accountClient";
import { PlaySheet } from "./PlaySheet";
import { useRoomApi } from "./useRoomApi";
import { YourVoyages } from "./YourVoyages";

/** Play, with the player's voyages (#301) read through the rooms API. */
export function PlayPage({ client, saved }: { client: AccountClient; saved: boolean }) {
  const api = useRoomApi(client);
  return <PlaySheet voyages={<YourVoyages api={api} />} saved={saved} />;
}
