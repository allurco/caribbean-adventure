import type { AccountClient } from "./accountClient";
import { JoinRoom } from "./JoinRoom";
import { NewRoomForm } from "./NewRoomForm";
import { OnlineSheet } from "./OnlineSheet";
import type { OnlineRoute } from "./onlineRoute";
import { RoomLobby } from "./RoomLobby";
import { useRoomApi } from "./useRoomApi";

/** One online view for the signed-in player, in its sheet. */
export function OnlineView({ client, route }: { client: AccountClient; route: OnlineRoute }) {
  const api = useRoomApi(client);
  switch (route.kind) {
    case "newRoom":
      return (
        <OnlineSheet title="A private room" subtitle="Invite your friends with a link; start once every seat is taken.">
          <NewRoomForm api={api} />
        </OnlineSheet>
      );
    case "room":
      return (
        <OnlineSheet title="The room">
          <RoomLobby api={api} id={route.id} />
        </OnlineSheet>
      );
    case "join":
      return (
        <OnlineSheet title="An invitation">
          <JoinRoom api={api} inviteCode={route.inviteCode} />
        </OnlineSheet>
      );
  }
}
