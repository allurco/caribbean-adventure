import { newRoomPath } from "./onlineRoute";
import type { ComingScreen } from "./shellRoute";
import { BTN_BRASS } from "./shellStyles";

/** What each screen still to be built will hold, and who builds it. */
const COMING: Record<ComingScreen, { lead: string; body: string }> = {
  lobby: {
    lead: "The lobby is still being fitted out.",
    body: "Public rooms looking for captains will be listed here, to join with one click.",
  },
  party: {
    lead: "Parties are still being fitted out.",
    body: "Friends will team up here, chat, and join a room or the ranked queue together as one crew.",
  },
  ranked: {
    lead: "The ranked queue is still being fitted out.",
    body: "Captains will be matched here by rating, and every ranked match will move it.",
  },
};

/** A styled "coming" sheet for Lobby, Party and Ranked (#125) until their own tickets (#117, #119, #121) build them. */
export function ComingSheet({ screen }: { screen: ComingScreen }) {
  const { lead, body } = COMING[screen];
  return (
    <div className="space-y-4">
      <p className="font-fell text-[24px] leading-tight">{lead}</p>
      <p className="text-[16px] text-shell-ink-soft">{body}</p>
      <p className="text-[16px] text-shell-ink-soft">Until then, open a private room and send your friends the invite link.</p>
      <a href={newRoomPath()} className={BTN_BRASS}>
        Open a private room
      </a>
    </div>
  );
}
