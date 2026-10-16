/**
 * The entry the deployed function runs (#112, ADR 0008): `npm run build:api`
 * bundles this file, with the game code and every dependency, into
 * `api/_server.mjs`, which `api/index.ts` loads. Bundled because Vercel
 * transpiles functions file by file and Node's ES modules cannot resolve the
 * game's extensionless imports or `boardgame.io/internal`.
 *
 * `waitUntil` (`waitUntil.ts`) keeps the realtime signal and a seat's
 * last-seen write (#114) running after the response is sent.
 */
import { handleApiRequest, type ApiServices } from "./handleApiRequest";
import { servicesFromEnv } from "./services";
import { waitUntil } from "./waitUntil";

let services: ApiServices | null | undefined;

export function handle(request: Request): Promise<Response> {
  if (services === undefined) {
    const built = servicesFromEnv(process.env);
    services = built && { ...built, defer: waitUntil };
  }
  return handleApiRequest(request, process.env, services);
}
