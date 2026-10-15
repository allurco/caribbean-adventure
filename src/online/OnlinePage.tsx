import type { AccountClient } from "./accountClient";
import { JoinRoom } from "./JoinRoom";
import { NewRoomForm } from "./NewRoomForm";
import { OnlineSheet } from "./OnlineSheet";
import type { OnlineRoute } from "./onlineRoute";
import { RoomLobby } from "./RoomLobby";
import { SignInGate } from "./SignInGate";
import type { SupabaseConfig } from "./supabaseConfig";
import { useRoomApi } from "./useRoomApi";

/** The online play views (#112): a new room, a room's lobby, an invite. All need a signed-in player. */
export function OnlinePage({ config, route }: { config: SupabaseConfig; route: OnlineRoute }) {
  return <SignInGate config={config}>{(client) => <OnlineView client={client} route={route} />}</SignInGate>;
}

function OnlineView({ client, route }: { client: AccountClient; route: OnlineRoute }) {
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
