/**
 * Keeps work running after the response is sent, on Vercel (#114: the
 * realtime signal and a seat's last-seen write). The same lookup as
 * `waitUntil` in `@vercel/functions`: the Vercel runtime puts the request's
 * context on a global symbol, and its `waitUntil` holds the function open
 * until the work settles. Inlined, as that package's CommonJS index would
 * add every one of its modules to the bundle. Says whether it handed the
 * work off: off Vercel (no context) it does not, and the caller awaits the
 * work itself (`afterResponse.ts`).
 */

interface RequestContext {
  waitUntil?: (work: Promise<unknown>) => void;
}

const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

export function waitUntil(work: Promise<unknown>): boolean {
  const holder = (globalThis as { [REQUEST_CONTEXT]?: { get?: () => RequestContext | undefined } })[REQUEST_CONTEXT];
  const keep = holder?.get?.()?.waitUntil;
  if (!keep) return false;
  keep(work);
  return true;
}
