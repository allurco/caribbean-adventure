# Deploying: Vercel + Supabase

The online backend (PRD #104, first slice #105) runs on Vercel and Supabase:

- **Vercel** builds the Vite app (`npm run build`, output `dist/`) and serves it as a single-page app. Every `/api/*` request goes to the one Vercel Function, `api/index.ts`, which routes it in `server/handleApiRequest.ts`. `vercel.json` holds the build settings, both rewrites, and the `includeFiles` that ships the bundled server with the function: `npm run build` ends with `npm run build:api`, which bundles the server and the game code into `api/_server.mjs` (git-ignored; ADR 0008).
- **Supabase**, added from the Vercel Marketplace, provides Postgres, Auth (email magic links for now) and, later, Realtime. The schema is the SQL under `supabase/migrations/`.

With no Supabase settings the app is the local hotseat game, exactly as before: no sign-in link and no backend calls. CI runs that way.

The repo is public. Keys and URLs of the real project live only in Vercel's and Supabase's environment settings, never in a tracked file.

## Environment variables

| Name | Where it comes from | Read by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase Marketplace integration | The browser (the app) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The Supabase Marketplace integration | The browser (the app) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | The Supabase Marketplace integration | `/api` only: the online routes (rooms, #112) act with this service-role key after checking the caller's access token. `SUPABASE_SERVICE_ROLE_KEY` is read when there is no `SUPABASE_SECRET_KEY`. Without them the online routes answer 503. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`) | You, in `.env.local` for local development | The browser (the app) |

The integration also injects `POSTGRES_*` and other variables; nothing reads them yet.

The app reads either naming: `vite.config.ts` exposes the `VITE_` and `NEXT_PUBLIC_SUPABASE_` prefixes to the browser, and `src/online/supabaseConfig.ts` takes the first URL and key it finds (`VITE_` names first, publishable key before anon key). Both browser values are public by design; row-level security guards the data. Never give a secret a `VITE_` or `NEXT_PUBLIC_` name: Vite bakes those into the shipped JavaScript.

## One-time set-up (maintainer)

1. **Create the Vercel project.** In Vercel, choose **Add New → Project** and import the GitHub repository. Vercel reads `vercel.json` (framework Vite, `npm run build`, output `dist`), so leave the build settings at their defaults. Deploy once. The game works with no backend, so this first deploy shows the hotseat game.
2. **Add Supabase from the Marketplace.** In the Vercel project, open **Storage** (or **Integrations → Marketplace**), choose **Supabase**, create a new Supabase project (pick a region near the players), and connect it to this Vercel project for **Production** and **Preview** (and **Development** if you use `vercel env pull`). Keep the integration's default `NEXT_PUBLIC_` prefix. The variables in the table above appear under **Settings → Environment Variables**.
3. **Apply the schema.** From a local checkout, using the Supabase CLI that comes with `npm install`:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>   # the ref is in the project's dashboard URL
   npx supabase db push                            # applies supabase/migrations/*.sql
   ```
   Run `npx supabase db push` again whenever a pull request adds a migration, until preview branching (#107) does it for you.
4. **Set the Auth URLs.** In the Supabase dashboard, open **Authentication → URL Configuration**:
   - **Site URL:** the production URL, for example `https://<project>.vercel.app` (or the custom domain).
   - **Redirect URLs**, add:
     - `https://<project>.vercel.app/**` (and the custom domain's, if any)
     - `https://*-<team-or-account-slug>.vercel.app/**`, for preview deployments
     - `http://localhost:5173/**`, for local development against the hosted project (optional)
5. **Email.** The default **Magic Link** template (Authentication → Emails) works as it is: its `{{ .ConfirmationURL }}` returns the player to the page that asked for the link (`/?view=account`). Supabase's built-in sender is rate-limited to a few emails an hour and meant for testing; before real players arrive, set up custom SMTP under **Authentication → Emails → SMTP Settings**.
6. **Redeploy** the production deployment so the build picks up the new variables (Vercel bakes the browser variables in at build time).

### Check it

After a pull request that adds a migration is merged, run `npx supabase db push` (step 3) before playing online: the rooms (#112) need `supabase/migrations/20261015000000_rooms.sql`, online turns (#113) `20261016000000_moves.sql`, and the list of a player's voyages (`GET /api/me/rooms`) `20261017000000_voyages.sql` and `20261018000000_voyages_fight.sql` (who may act in a fight).

- `https://<project>.vercel.app/api/health` answers `{"ok":true,"version":"<commit>","environment":"production","supabase":{"configured":true}}`.
- The root URL opens the online shell (#125): its sign-in screen asks for an email and sends a link; opening it signs you in and lands you on Play. **Profile** (`/?view=account`) shows your captain, whose display name you can change. **Your public profile** opens `/?view=profile&id=<your id>`, which anyone can read, signed in or not.
- **Play on this device** (`/?skipLogin=1`, or the root URL with a dev URL parameter such as `?seed=`) opens the local game. Its corner link reads **The harbour** when signed in, or **Sign in** when not, and goes back to the shell. Other query parameters on the root URL (a link tracker's `?fbclid=`, `?utm_source=`) are ignored: it still opens the shell.
- **Open a private room** (`/?view=rooms`) creates a room and opens its lobby (`/?view=room&id=…`) with the invite link (`/?view=join&invite=…`). A second account that opens the link, signed in, takes a seat; the host's **Start match** then creates the match, and **Board your ship** (`/?view=match&id=…`) opens each seat's own board, which checks for the other captains' moves every few seconds. `POST https://<project>.vercel.app/api/rooms` without a token answers 401 (503 means the server's Supabase variables are missing).

## Local development

Hotseat only, as before: `npm run dev`. No Supabase, no Docker.

Against a local Supabase (needs Docker running):

```bash
npx supabase start        # first run pulls the images; applies supabase/migrations
npx supabase status       # prints the API URL and the anon / publishable key
cp .env.example .env.local
# fill VITE_SUPABASE_URL (http://127.0.0.1:54321) and VITE_SUPABASE_ANON_KEY from the status output
npm run dev
```

Open `http://localhost:5173/?view=account` and ask for a link. Local Supabase sends no real email: the link appears in Mailpit at `http://127.0.0.1:54324`. `supabase/config.toml` allows redirects back to the Vite dev server on `localhost` and `127.0.0.1`.

`npx supabase db reset` rebuilds the local database from the migrations; `npx supabase stop` shuts the stack down. A new migration: `npx supabase migration new <name>`, then write its SQL.

To try the `/api` function locally, use `npx vercel dev` (this needs `vercel link` to a project, and `npm run build:api` first), or call `handleApiRequest` from a test as `server/rooms.test.ts` does. The Vite dev server does not serve `/api`, so the room pages need `vercel dev` (with `SUPABASE_URL` and `SUPABASE_SECRET_KEY` set to the local stack's API URL and service-role key) to work locally.

## Tests

- `npm test`: the unit tests, the account code against a fake client included. The database tests are skipped.
- `npm run test:e2e`: two browsers play an online match (Playwright), against a dev-only backend (`e2e/e2eBackend.ts`: the real `/api` router over the in-memory store and fixed test tokens). Needs no Docker; it is only ever loaded by `e2e/vite.e2e.config.ts`, applies to the dev server only, and starts only with `E2E_BACKEND=1` (set by the Playwright config), never on Vercel or with `NODE_ENV=production`.
- `npm run test:db`: the row-level security tests in `supabase/tests/` (profiles; rooms, seats and matches, including the `/api` routes run against the real database), against the local Supabase from `npx supabase start`. They read the URL and keys from `npx supabase status`, or from `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` and `SUPABASE_TEST_SERVICE_ROLE_KEY` when those are set. They create throwaway users and delete them afterwards.
