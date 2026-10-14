import { useState, type FormEvent } from "react";
import type { AccountClient } from "./accountClient";
import { saveDisplayName, type Profile } from "./accountService";
import { BTN_BRASS, INPUT, LABEL } from "./shellStyles";

interface DisplayNameFormProps {
  client: AccountClient;
  profile: Profile;
  onSaved: (profile: Profile) => void;
}

/** Edits the signed-in player's display name. */
export function DisplayNameForm({ client, profile, onSaved }: DisplayNameFormProps) {
  const [name, setName] = useState(profile.displayName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await saveDisplayName(client, profile.id, name);
    setSaving(false);
    if (result.ok && result.profile) {
      setName(result.profile.displayName);
      setMessage({ error: false, text: "Saved." });
      onSaved(result.profile);
    } else {
      setMessage({ error: true, text: result.ok ? "That profile could not be changed." : result.error });
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="display-name" className={LABEL}>
        Display name
      </label>
      <div className="flex gap-2">
        <input
          id="display-name"
          type="text"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setMessage(undefined);
          }}
          className={INPUT}
        />
        <button type="submit" disabled={saving} className={`${BTN_BRASS} shrink-0`}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-2 text-[15px] ${message.error ? "text-shell-ink-wax" : "text-shell-ink-soft italic"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
