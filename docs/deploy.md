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
2. **Add Supabase from the Marketplace.** In the Vercel project, open **Storage** (or **Integrations → Marketplace**), choose **Supabase**, create a new Supabase project (pick a region near the players), and connect it to this Vercel project for **Production** and **Preview** (and **Development** if you use `vercel env pull`). Keep the integration's default `NEXT_PUBLIC_` prefix. Once preview branches are on, the connection keeps **Production** only: see [Preview branches](#preview-branches-107), step 4. The variables in the table above appear under **Settings → Environment Variables**.
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

## Preview branches (#107)

Every pull request's Vercel preview gets its own Supabase **preview branch**: a separate Supabase instance with its own URL and keys, built from the PR's `supabase/migrations/`, empty of production data, and deleted when the PR closes. Schema changes are tried there and never touch production.

### How it works

- **Migrations.** Supabase's GitHub integration watches the repository. When a git branch appears, it creates a Supabase branch and runs its workflow: apply `supabase/config.toml`, then every migration the branch has not run, then the seed, then Edge Functions. It runs again on every push to that git branch, applying only new migrations. The branch starts empty; this repo has no seed file, and none is needed: signing in creates the profile (`handle_new_user`).
- **Settings.** The `[auth]`, `[api]`, `[db]` and `[storage]` sections of `supabase/config.toml` are applied to every preview branch. That is why `additional_redirect_urls` there also allows `https://caribbean-adventure-*.vercel.app/**`, the previews' hosts. Production never takes its settings from this file: no `[remotes]` block names it, and the production deployment applies migrations only, never Auth settings.
- **Grants.** A preview branch has none of Supabase's default privileges on `public`, so every table must be granted to the roles that use it in a migration. `/api` works as the service role: `20261019120000_service_role_grants.sql` grants it every table, and `supabase/tests/branchGrants.test.ts` fails when a new table is not granted to it.
- **Variables.** When the PR is opened, Supabase writes the branch's URL and keys into the Vercel project as **Preview variables scoped to that PR's git branch**, under the same names production uses (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, …). The app reads them unchanged: the browser at build time, `/api` at run time, from the same deployment.
- **Build time.** Vite bakes the browser's values into the JavaScript when the deployment builds. A preview built before Supabase wrote the branch's variables has no backend, or production's if production's values reach the Preview scope. Supabase deals with the race by redeploying the PR's latest deployment once the variables are written, and Vercel rebuilds it with them. A deployment's variables never change after it is built, so the deployment to check is the latest one.
- **Guard.** A preview that was still handed production's URL refuses it. The browser runs with no backend (the hotseat game, no sign-in) and `/api` answers 503 (`src/online/previewGuard.ts`, read by `supabaseConfig.ts` and `server/services.ts`). This needs `NEXT_PUBLIC_SUPABASE_PRODUCTION_URL` (step 5); without it nothing is compared. Every preview also shows a small tag at the bottom of the page naming the Supabase project it talks to (`PreviewMarker`), which production never shows.

### Cost

Branching is not on Supabase's Free plan: it needs **Pro** ($25 a month, billed through Vercel for a Marketplace organisation). Each preview branch is then billed per hour it exists: $0.01344 an hour on the default Micro size, about $0.32 a day or $9.70 for a whole month, plus its egress and disk. Branches are **not** covered by the Spend Cap, and Pro's compute credits do not apply to them. A PR left open for a month costs about $10; close stale PRs. Usage shows under **Organization → Usage → Branching Compute Hours**. Prices as of October 2026: check [supabase.com/pricing](https://supabase.com/pricing) before enabling.

### Set-up (maintainer, once)

1. **Plan.** Move the Supabase organisation to Pro, if you accept the cost above.
2. **Supabase GitHub integration.** In the Supabase dashboard, open **Project Settings → Integrations**, then under **GitHub Integration**:
   - click **Authorize GitHub**, then **Authorize Supabase**, and pick this repository;
   - **Working directory:** `.`;
   - **Automatic branching:** on. Leave **Supabase changes only** off: with it on, a PR that changes no file under `supabase/` gets no branch, and its preview runs with no backend;
   - **Deploy to production:** optional. On, it applies new migrations to production when a PR merges into `main`, replacing the manual `npx supabase db push` (set-up step 3). Turn it on only after production has every migration in `main` applied (`npx supabase migration list` shows each one on both sides);
   - click **Enable integration**.
3. **Vercel integration.** The Vercel project must deploy from GitHub (it does, from set-up step 1). In the Supabase dashboard, check **Organization → Integrations → Vercel** lists this Supabase project as connected to the Vercel project (a Marketplace project is connected already).
4. **Keep production's values out of previews.** In the Vercel project, open the Supabase connection's settings (**Storage** or **Integrations → Supabase → Manage**) and leave only **Production** (and **Development** if you use it) ticked: untick **Preview**. Users report that with Preview ticked, production's values are synced to every preview and win over the branch's. Then, under **Settings → Environment Variables**, filter by **Preview** and delete any Supabase variable (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_*`, `POSTGRES_*`) scoped to **all** preview branches. Variables scoped to one git branch are the branches' own: keep them.
5. **Name production's URL for the guard.** Add `NEXT_PUBLIC_SUPABASE_PRODUCTION_URL` under **Settings → Environment Variables**, value production's `NEXT_PUBLIC_SUPABASE_URL` (`https://<production-ref>.supabase.co`), for **Preview** (all branches) and **Production**. It is not a secret: every production build already ships it.
6. **Required check.** In GitHub, **Settings → Branches** (or **Rules**), require the **Supabase Preview** status check on `main`, so a PR whose migrations fail on its branch cannot merge.
7. **Auth on previews.** Nothing to set in production's dashboard: a branch takes its Auth settings from `supabase/config.toml`. Note:
   - **Magic links** come from the branch's own Auth. Supabase's built-in sender is rate-limited, and as far as Supabase's docs say, delivers only to members of the Supabase organisation, so sign in on previews with a team member's address. A custom SMTP password becomes a placeholder on a branch; set it as a branch secret if previews need custom SMTP.
   - **OAuth (#106)** does not work on previews as they stand: OAuth provider secrets become placeholders on a branch, and each branch has its own callback URL (`https://<branch-ref>.supabase.co/auth/v1/callback`), which the provider's app would have to list. Use a magic link on previews.
   - The redirect pattern `https://caribbean-adventure-*.vercel.app/**` also matches any Vercel project whose name starts with `caribbean-adventure-`. It applies only to preview branches and the local stack, whose accounts are throwaway. To tighten it, replace it with `https://caribbean-adventure-*-<team-or-account-slug>.vercel.app/**`.
8. **Apply the grants to production.** `20261019120000_service_role_grants.sql` changes nothing on production (the service role already holds those privileges there), but apply it like any other migration (`npx supabase db push`, or **Deploy to production**) so production's migration history matches the repository.

### Check a preview reads its branch

Open a pull request (any change), then:

1. **The branch.** The PR gets a **Supabase Preview** check and a Supabase comment with the branch's status. In the Supabase dashboard, switch to the branch (the branch selector next to the project name): **Database → Migrations** lists every file in `supabase/migrations/`, including any the PR adds.
2. **The variables.** In Vercel, **Settings → Environment Variables**, filtered by Preview, shows `NEXT_PUBLIC_SUPABASE_URL` and the rest scoped to the PR's git branch, with the branch's URL.
3. **The deployment.** Open the PR's latest preview deployment, the one Supabase redeployed after writing the variables. The tag at the bottom reads `Preview · database <branch-ref>`, where `<branch-ref>` is the branch's ref, not production's.
   - `Preview · online play off: this build was given production's database`: production's values reach the Preview scope. Redo step 4, then redeploy.
   - `Preview · online play off: no database`: the build ran before the branch's variables existed. Redeploy it, or wait for Supabase's redeploy.
4. **The API.** `<preview URL>/api/health` answers `"environment":"preview"` and `"supabase":{"configured":true}`. `"previewOnProduction":true` means the server was handed production's URL and refused it.
5. **Sign-in and profiles.** On the preview, sign in with a magic link; the link brings you back to the preview, not to `localhost`. Change your display name under **Profile**. In the Supabase dashboard, on the **branch**, **Table Editor → profiles** has your row with the new name; on **production**, your profile still has its old name (or no row, for an address never used there).

### Tear-down

- **Closing or merging the PR deletes its preview branch**, and its hourly billing stops. Persistent branches are not deleted this way; don't create any unless you want a long-lived staging database.
- Delete a branch by hand under **Branches** in the Supabase dashboard (for example to rebuild one from scratch: close and reopen the PR afterwards). Seeding runs only when a branch is created.
- If old branch-scoped Supabase variables are left in Vercel after their branches are gone, delete them under **Settings → Environment Variables**; nothing reads them.
- To stop preview branches entirely, turn **Automatic branching** off (or disable the GitHub integration) in **Project Settings → Integrations**, and delete the remaining branches. Previews then run with no backend, unless step 4 is undone.

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
