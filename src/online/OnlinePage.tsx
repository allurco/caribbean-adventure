import type { OnlineRoute } from "./onlineRoute";
import { OnlineView } from "./OnlineView";
import { SignInGate } from "./SignInGate";
import type { SupabaseConfig } from "./supabaseConfig";

/** The online play views (#112): a new room, a room's lobby, an invite. All need a signed-in player. */
export function OnlinePage({ config, route }: { config: SupabaseConfig; route: OnlineRoute }) {
  return <SignInGate config={config}>{(client) => <OnlineView client={client} route={route} />}</SignInGate>;
}
