/**
 * Runs `work` after the response where the platform keeps it running
 * (`ApiServices.defer`, Vercel's `waitUntil`, #114); otherwise, with no
 * platform to defer to or one that did not take it, awaits it before the
 * route answers, so the work is never left unawaited.
 */
import type { ApiServices } from "./handleApiRequest";

export async function afterResponse(services: Pick<ApiServices, "defer">, work: Promise<unknown>): Promise<void> {
  if (services.defer?.(work)) return;
  await work;
}
