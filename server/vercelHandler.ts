/**
 * The entry the deployed function runs (#112, ADR 0008): `npm run build:api`
 * bundles this file, with the game code and every dependency, into
 * `api/_server.mjs`, which `api/index.ts` loads. Bundled because Vercel
 * transpiles functions file by file and Node's ES modules cannot resolve the
 * game's extensionless imports or `boardgame.io/internal`.
 *
 * `waitUntil` (`@vercel/functions`) keeps the realtime signal (#114) running
 * after the move's response is sent. It reads the request's context from a
 * global the Vercel runtime sets, so it works bundled; outside Vercel (no
 * context) it does nothing and the signal still runs, unawaited.
 */
import { waitUntil } from "@vercel/functions";
import { handleApiRequest, type ApiServices } from "./handleApiRequest";
import { servicesFromEnv } from "./services";

let services: ApiServices | null | undefined;

export function handle(request: Request): Promise<Response> {
  if (services === undefined) {
    const built = servicesFromEnv(process.env);
    services = built && { ...built, defer: (work) => void waitUntil(work) };
  }
  return handleApiRequest(request, process.env, services);
}
