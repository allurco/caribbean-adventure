import type { AccountClient } from "./accountClient";
import { JoinRoom } from "./JoinRoom";
import { NewRoomForm } from "./NewRoomForm";
import type { OnlineRoute } from "./onlineRoute";
import { RoomLobby } from "./RoomLobby";
import { useRoomApi } from "./useRoomApi";

/** A room view (#112) on the shell's sheet (#125): a new room, a room's lobby, an invite. The nameboard carries its title. */
export function OnlineView({ client, route }: { client: AccountClient; route: Exclude<OnlineRoute, { kind: "match" }> }) {
  const api = useRoomApi(client);
  return (
    <div className="space-y-5 text-[16px]">
      {route.kind === "newRoom" && <NewRoomForm api={api} />}
      {route.kind === "room" && <RoomLobby api={api} id={route.id} />}
      {route.kind === "join" && <JoinRoom api={api} inviteCode={route.inviteCode} />}
    </div>
  );
}
