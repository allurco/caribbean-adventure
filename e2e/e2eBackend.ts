/**
 * A stand-in backend for the browser tests of online play (#113), with no
 * Docker: `/api` served by the real router (`handleApiRequest`) over the
 * in-memory store, and sign-in checked against a fixed table of test
 * tokens. A Vite plugin used only by `e2e/vite.e2e.config.ts`, which only
 * `npm run test:e2e` loads.
 *
 * It can never be on in production: the app's `vite.config.ts` and the
 * `/api` bundle never import it, the plugin applies to the dev server only
 * (`apply: "serve"`), and it starts only with E2E_BACKEND=1 (which only
 * the Playwright config sets), never on Vercel or with NODE_ENV=production.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import type { Plugin } from "vite";
import type { ApiServices } from "../server/handleApiRequest";
import { DELETED_PLAYER_NAME } from "../src/online/displayName";
import { E2E_PLAYERS, E2E_SUPABASE_PATH } from "./e2ePlayers";

type ServerEntry = typeof import("./e2eServerEntry");

/**
 * The server code, bundled as `npm run build:api` bundles it: Node's ES
 * modules cannot load the game's extensionless imports unbundled.
 */
async function loadServer(): Promise<ServerEntry> {
  const outfile = fileURLToPath(new URL("../node_modules/.tmp/e2e-server.mjs", import.meta.url));
  await build({
    entryPoints: [fileURLToPath(new URL("./e2eServerEntry.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile,
    logLevel: "warning",
  });
  return (await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)) as ServerEntry;
}

const players = Object.values(E2E_PLAYERS);

async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
  return new Request(new URL(req.url ?? "/", origin), { method: req.method, headers, body });
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export function e2eBackend(): Plugin {
  return {
    name: "e2e-backend",
    apply: "serve",
    async configureServer(server) {
      // Fail closed: only an explicit opt-in (set by e2e/playwright.config.ts)
      // starts it, and never on Vercel or in production.
      if (process.env.E2E_BACKEND !== "1" || process.env.VERCEL || process.env.NODE_ENV === "production") {
        throw new Error("The e2e backend runs only for the local browser tests (E2E_BACKEND=1).");
      }
      const { handleApiRequest, createMemoryOnlineStore, accountGone, newInviteCode, newMapSeed, newMatchSeed } = await loadServer();
      const store = createMemoryOnlineStore({ displayName: (id) => players.find((p) => p.id === id)?.name ?? null });
      // A token stops working once its account is deleted (#108), as with Supabase Auth.
      const signedIn = async (token: string | undefined) => {
        const player = players.find((p) => p.token === token);
        return player && !(await store.peekSignInDeleted(player.id)) ? player : null;
      };
      const services: ApiServices = {
        // As supabaseAuthVerifier: a deleted account's token is `account_deleted`, not a dead token.
        auth: async (token) => {
          const player = players.find((p) => p.token === token);
          if (player && (await store.peekSignInDeleted(player.id))) throw accountGone();
          return player?.id ?? null;
        },
        store,
        newInviteCode,
        newMapSeed,
        newMatchSeed,
      };
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        try {
          if (url.startsWith("/api/")) {
            return await send(res, await handleApiRequest(await toRequest(req, "http://localhost"), {}, services));
          }
          if (url.startsWith(`${E2E_SUPABASE_PATH}/auth/v1/user`)) {
            const player = await signedIn(req.headers.authorization?.replace(/^Bearer\s+/i, ""));
            return player ? json(res, 200, { id: player.id, aud: "authenticated", role: "authenticated" }) : json(res, 401, {});
          }
          if (url.startsWith(`${E2E_SUPABASE_PATH}/rest/v1/profiles`)) {
            const id = new URL(url, "http://localhost").searchParams.get("id")?.replace(/^eq\./, "");
            const player = players.find((p) => p.id === id);
            if (!player) return json(res, 200, null);
            const deleted = await store.peekProfileDeleted(player.id);
            return json(res, 200, {
              id: player.id,
              display_name: deleted ? DELETED_PLAYER_NAME : player.name,
              avatar_url: null,
              deleted_at: deleted ? new Date(0).toISOString() : null,
            });
          }
          if (url.startsWith(E2E_SUPABASE_PATH)) return json(res, 200, {});
        } catch (error) {
          return next(error);
        }
        next();
      });
    },
  };
}
