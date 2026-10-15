// The one Vercel Function (#105): every /api/* request is rewritten here
// (vercel.json) and routed in server/handleApiRequest.ts. Keep other modules
// out of api/: Vercel deploys each file in it as a function of its own (files
// starting with `_` excepted).
//
// The server runs bundled (#112, ADR 0008): `npm run build` ends with
// `build:api`, which bundles server/vercelHandler.ts, the game code and every
// dependency into api/_server.mjs (git-ignored). Vercel runs the project's
// build command before it builds functions, and vercel.json's `includeFiles`
// ships the bundle with this function. Node's ES modules could not load the
// server unbundled: the game's imports carry no file extensions.
type ServerBundle = typeof import("../server/vercelHandler");

// A variable, not a literal: the bundle exists only after a build, and the
// type comes from its source.
const BUNDLE = "./_server.mjs";
let server: Promise<ServerBundle> | undefined;

export default {
  async fetch(request: Request): Promise<Response> {
    server ??= import(BUNDLE) as Promise<ServerBundle>;
    return (await server).handle(request);
  },
};
