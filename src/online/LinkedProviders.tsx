import { useEffect, useState } from "react";
import type { AccountClient } from "./accountClient";
import { fetchLinkedProviders } from "./accountService";
import { OAUTH_PROVIDER_LABELS, type OAuthProvider } from "./oauthProviders";

/**
 * On the player's own page (#106): the Discord and Google accounts they sign
 * in with. Only the player can read these; their public profile never shows
 * them. Says nothing until read, or when there are none or the read fails.
 */
export function LinkedProviders({ client, id }: { client: AccountClient; id: string }) {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  useEffect(() => {
    let live = true;
    void fetchLinkedProviders(client, id).then((result) => {
      if (live && result.ok) setProviders(result.providers);
    });
    return () => {
      live = false;
    };
  }, [client, id]);

  if (providers.length === 0) return null;
  return (
    <p className="text-[15px] text-shell-ink-soft">
      Signs in with {providers.map((provider) => OAUTH_PROVIDER_LABELS[provider]).join(" and ")}.
    </p>
  );
}
