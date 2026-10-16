import { useEffect, useState } from "react";
import type { AccountClient } from "./accountClient";
import { signInWithProvider } from "./accountService";
import { OAUTH_PROVIDER_LABELS, OAUTH_PROVIDERS, type OAuthProvider } from "./oauthProviders";
import { onPageRestored } from "./pageRestore";
import { signInRedirectUrl } from "./signInReturn";
import { BTN_INK } from "./shellStyles";

type ButtonsState = { phase: "idle"; error?: string } | { phase: "leaving"; provider: OAuthProvider };

/**
 * Discord and Google sign-in (#106): each button sends the player to the
 * provider, which brings them back to this page signed in. While the
 * browser leaves, the buttons stay disabled; if the redirect cannot start,
 * the reason shows under them. Back from the provider may restore this page
 * from the back-forward cache as it left; the buttons are then ready again.
 */
export function ProviderButtons({ client }: { client: AccountClient }) {
  const [state, setState] = useState<ButtonsState>({ phase: "idle" });
  useEffect(() => onPageRestored(window, () => setState({ phase: "idle" })), []);

  async function start(provider: OAuthProvider) {
    setState({ phase: "leaving", provider });
    const result = await signInWithProvider(client, provider, signInRedirectUrl(window.location.href));
    if (!result.ok) setState({ phase: "idle", error: result.error });
  }

  return (
    <div>
      {/* Side by side on a phone held sideways, where the card has little height to spare */}
      <div className="flex flex-col gap-2 short-landscape:flex-row">
        {OAUTH_PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={state.phase === "leaving"}
            onClick={() => void start(provider)}
            aria-label={`Continue with ${OAUTH_PROVIDER_LABELS[provider]}`}
            className={`${BTN_INK} w-full py-2 text-[16px] short-landscape:py-1.5`}
          >
            {state.phase === "leaving" && state.provider === provider ? (
              `Opening ${OAUTH_PROVIDER_LABELS[provider]}…`
            ) : (
              <>
                <span className="short-landscape:hidden">Continue with</span>
                {OAUTH_PROVIDER_LABELS[provider]}
              </>
            )}
          </button>
        ))}
      </div>
      {state.phase === "idle" && state.error && (
        <p role="alert" className="mt-2 text-[15px] text-shell-ink-wax">
          {state.error}
        </p>
      )}
    </div>
  );
}
