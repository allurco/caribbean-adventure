import { useId, useState, type FormEvent } from "react";
import type { AccountClient } from "./accountClient";
import { deleteAccount } from "./accountService";
import { confirmsDeletion, DELETE_CONFIRMATION_WORD } from "./deleteConfirmation";
import { BTN_INK, BTN_INK_DANGER, INPUT, LABEL } from "./shellStyles";
import { useApiDeps } from "./useRoomApi";

/**
 * Deleting the signed-in player's own account (#108), on their profile sheet
 * only: a closed row until asked, then what deleting does and a typed word to
 * confirm. Once `/api` has deleted it the session ends here, and the shell
 * shows the sign-in screen.
 */
export function DeleteAccount({ client }: { client: AccountClient }) {
  const api = useApiDeps(client);
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmsDeletion(typed)) return;
    setDeleting(true);
    setError(undefined);
    const result = await deleteAccount(client, api);
    // On success the session ends and this sheet unmounts.
    if (!result.ok) {
      setDeleting(false);
      setError(result.error);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] text-shell-ink-soft">Done with the sea for good?</span>
        <button type="button" onClick={() => setOpen(true)} className={`${BTN_INK_DANGER} shrink-0`}>
          Delete account
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} aria-labelledby={`${fieldId}-title`} className="space-y-3 rounded-[3px] border border-shell-ink-wax/50 bg-shell-ink-wax/[0.06] p-3">
      <p id={`${fieldId}-title`} className="font-fell text-[19px] text-shell-ink-wax">
        Delete your account?
      </p>
      <ul className="list-disc space-y-1 pl-5 text-[15px]">
        <li>Your name and picture are wiped. Your profile stays only as “Deleted player”, so the matches you sailed in still read right.</li>
        <li>You leave every room still waiting in its lobby. Matches under way keep your seat, under that name.</li>
        <li>You are signed out. Signing in again with the same email starts a new captain.</li>
        <li>This cannot be undone.</li>
      </ul>
      <div>
        <label htmlFor={fieldId} className={LABEL}>
          Type {DELETE_CONFIRMATION_WORD} to confirm
        </label>
        <input
          id={fieldId}
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className={INPUT}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(undefined);
          }}
          className={BTN_INK}
        >
          Keep my account
        </button>
        <button type="submit" disabled={deleting || !confirmsDeletion(typed)} className={BTN_INK_DANGER}>
          {deleting ? "Deleting…" : "Delete my account"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-shell-ink-wax">
          {error}
        </p>
      )}
    </form>
  );
}
