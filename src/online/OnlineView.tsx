import type { AccountClient } from "./accountClient";
import { JoinRoom } from "./JoinRoom";
import { MatchView } from "./MatchView";
import { NewRoomForm } from "./NewRoomForm";
import { OnlineSheet } from "./OnlineSheet";
import type { OnlineRoute } from "./onlineRoute";
import { RoomLobby } from "./RoomLobby";
import { useRoomApi } from "./useRoomApi";
import { YourVoyages } from "./YourVoyages";

/** One online view for the signed-in player, in its sheet. */
export function OnlineView({ client, route }: { client: AccountClient; route: OnlineRoute }) {
  const api = useRoomApi(client);
  switch (route.kind) {
    case "newRoom":
      return (
        <OnlineSheet title="The harbour" subtitle="Your voyages, and a private room for a new one.">
          {route.saved && <p role="status">Your voyage is saved. Resume it below whenever you like.</p>}
          <YourVoyages api={api} />
          <section aria-labelledby="new-room-title" className="space-y-3">
            <h2 id="new-room-title" className="font-fell text-[22px] leading-tight">
              A private room
            </h2>
            <p className="text-[15px] text-shell-ink-soft">Invite your friends with a link; start once every seat is taken.</p>
            <NewRoomForm api={api} />
          </section>
        </OnlineSheet>
      );
    case "room":
      return (
        <OnlineSheet title="The room">
          <RoomLobby api={api} id={route.id} />
        </OnlineSheet>
      );
    case "match":
      return <MatchView client={client} matchId={route.id} />;
    case "join":
      return (
        <OnlineSheet title="An invitation">
          <JoinRoom api={api} inviteCode={route.inviteCode} />
        </OnlineSheet>
      );
  }
}
