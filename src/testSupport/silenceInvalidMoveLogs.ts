/**
 * Quiets boardgame.io's `ERROR: invalid move: …` log in a test file that sends
 * invalid moves on purpose (refusal tests, the move API's rate limits).
 * boardgame.io logs every refused move through `console.error("ERROR:", message)`;
 * this drops exactly those calls and passes every other `console.error` through,
 * so an unexpected error still prints. Call it at the top of the file, or inside
 * the `describe` whose tests send the invalid moves. The filter is installed in
 * `beforeEach`, so it covers moves sent inside tests only: a refused move sent
 * from `beforeAll` or at a file's top level still logs.
 */
import { afterEach, beforeEach, vi, type MockInstance } from "vitest";

const isInvalidMoveLog = (args: readonly unknown[]): boolean =>
  args[0] === "ERROR:" && typeof args[1] === "string" && args[1].startsWith("invalid move: ");

export function silenceInvalidMoveLogs(): void {
  let spy: MockInstance<typeof console.error> | undefined;
  beforeEach(() => {
    const original = console.error.bind(console);
    spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (!isInvalidMoveLog(args)) original(...args);
    });
  });
  afterEach(() => {
    spy?.mockRestore();
    spy = undefined;
  });
}
