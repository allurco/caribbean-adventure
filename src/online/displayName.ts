/**
 * The rules for a player's public display name (#105), the same ones the
 * `profiles` table's check constraint holds: trimmed, 1 to 32 characters
 * (code points, as Postgres' `char_length` counts them), no control
 * characters. Runs of whitespace collapse to one space.
 */
export const DISPLAY_NAME_MAX_LENGTH = 32;

/**
 * What a deleted account's profile is called (#108): the placeholder the
 * database's `anonymise_profile` writes (supabase/migrations), kept so match
 * records and others' histories still name a seat. Reserved: no live
 * profile may take it, whatever its case (`validateDisplayName` here, and the
 * table's `profiles_display_name_reserved` check).
 */
export const DELETED_PLAYER_NAME = "Deleted player";

export type DisplayNameResult = { ok: true; value: string } | { ok: false; reason: string };

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

export function validateDisplayName(raw: string): DisplayNameResult {
  const value = raw.replace(/\s+/g, " ").trim();
  if (value === "") return { ok: false, reason: "A captain needs a name." };
  if (CONTROL_CHARS.test(value)) return { ok: false, reason: "That name has characters that cannot be shown." };
  if ([...value].length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, reason: `At most ${DISPLAY_NAME_MAX_LENGTH} characters.` };
  }
  if (value.toLowerCase() === DELETED_PLAYER_NAME.toLowerCase()) {
    return { ok: false, reason: "That name is kept for deleted accounts." };
  }
  return { ok: true, value };
}
