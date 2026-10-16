/** Names as a sentence lists them: "A", "A and B", "A, B and C"; "" for none. Shared by the board and the online shell. */
export function listNames(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
