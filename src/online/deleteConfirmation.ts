/**
 * The confirmation before deleting an account (#108): the player types a word,
 * so a stray click or tap cannot delete it.
 */
export const DELETE_CONFIRMATION_WORD = "DELETE";

export function confirmsDeletion(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_CONFIRMATION_WORD;
}
