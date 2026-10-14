import { useState, type FormEvent } from "react";
import type { AccountClient } from "./accountClient";
import { accountPath } from "./accountRoute";
import { sendMagicLink } from "./accountService";
import { BTN_BRASS, INPUT, LABEL } from "./shellStyles";

type FormState = { phase: "editing"; error?: string } | { phase: "sending" } | { phase: "sent"; email: string };

/**
 * Email magic-link sign-in (#105): one field, then a note to check the inbox.
 * Discord and Google (#106) join it above an "or by email" rule.
 */
export function SignInForm({ client }: { client: AccountClient }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ phase: "editing" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ phase: "sending" });
    const result = await sendMagicLink(client, email, window.location.origin + accountPath());
    setState(result.ok ? { phase: "sent", email: email.trim() } : { phase: "editing", error: result.error });
  }

  if (state.phase === "sent") {
    return (
      <p role="status">
        A sign-in link is on its way to <strong className="font-semibold">{state.email}</strong>. Open it in this
        browser to come aboard.
      </p>
    );
  }
  return (
    <form onSubmit={submit}>
      <label htmlFor="sign-in-email" className={LABEL}>
        Email address
      </label>
      <input
        id="sign-in-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={INPUT}
      />
      {state.phase === "editing" && state.error && (
        <p role="alert" className="mt-2 text-[15px] text-shell-ink-wax">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={state.phase === "sending"} className={`${BTN_BRASS} mt-3 w-full`}>
        {state.phase === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="mt-4 text-[13px] leading-snug text-shell-ink-soft">
        You must be 13 or older. Other players see only your display name.
      </p>
    </form>
  );
}
