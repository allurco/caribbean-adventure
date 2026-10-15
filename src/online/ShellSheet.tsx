import type { AccountClient } from "./accountClient";
import type { AccountSession, Profile } from "./accountService";
import { ComingSheet } from "./ComingSheet";
import { OnlineView } from "./OnlineView";
import { OwnProfile } from "./OwnProfile";
import { PlayPage } from "./PlayPage";
import { PublicProfile } from "./PublicProfile";
import type { ShellPage } from "./shellRoute";
import type { ProfileState } from "./useProfile";

interface ShellSheetProps {
  page: ShellPage;
  client: AccountClient;
  /** Null only on a public profile viewed signed out. */
  session: AccountSession | null;
  ownProfile: ProfileState;
  onProfileSaved: (profile: Profile) => void;
}

/** The content of the online shell's one sheet (#125) for `page`. */
export function ShellSheet({ page, client, session, ownProfile, onProfileSaved }: ShellSheetProps) {
  if (page.kind === "profile") return <PublicProfile client={client} id={page.id} />;
  if (!session) return null;
  switch (page.kind) {
    case "play":
      return <PlayPage client={client} saved={page.saved === true} />;
    case "coming":
      return <ComingSheet screen={page.screen} />;
    case "account":
      return <OwnProfile client={client} session={session} profile={ownProfile} onSaved={onProfileSaved} />;
    case "newRoom":
    case "room":
    case "join":
      return <OnlineView client={client} route={page} />;
  }
}
