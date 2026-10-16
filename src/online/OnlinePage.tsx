import { MatchView } from "./MatchView";
import { SignInGate } from "./SignInGate";
import type { SupabaseConfig } from "./supabaseConfig";

/** `?view=match&id=…` (#113): the seat's own board, outside the shell, for a signed-in player. */
export function OnlinePage({ config, matchId }: { config: SupabaseConfig; matchId: string | null }) {
  return <SignInGate config={config}>{(client) => <MatchView client={client} matchId={matchId} />}</SignInGate>;
}
