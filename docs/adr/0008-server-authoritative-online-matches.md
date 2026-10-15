---
status: proposed
---

# Server-authoritative online matches: `/api` runs the reducer, Postgres holds the state, clients read only their view

Online play (PRD #104) has no boardgame.io server: the backend is one Vercel Function (`api/index.ts`) and Supabase. Rooms (#112) are the first slice that writes game data, so they settle how the server runs the game, where match state lives, who may read and write it, and how `/api` knows who is calling. We decided that **`/api` is the only writer of rooms, seats and matches; it builds and advances matches with boardgame.io's own reducer over the shared `src/game/` code; Postgres keeps the whole state where no client can read it; and each player receives only `playerViewFor(G, seat)`.**

## Decision

- **Tables** (`supabase/migrations/*_rooms.sql`): `rooms` (settings, invite code, status), `seats` (room, seat index = boardgame.io `playerID`, user), `matches` (one per room: the whole boardgame.io `State` as `jsonb`, `state_id`, phase, turn deadline) and `rate_counters`. Only user ids are stored; names come from `profiles`, provider ids stay in `auth.identities` (as in #105).
- **Row-level security on every table.** A signed-in player reads the rooms they hold a seat in, those rooms' seats, and those rooms' `matches` rows *without* `state`: the column is left out of the select grant, so the snapshot, with every hand, hold and the random seed, is unreadable from any client. Signed-out visitors read nothing. Membership is asked through a `security definer` function (`is_room_member`) that answers only for `auth.uid()`, so the seats policy does not recurse.
- **No client writes.** Neither `anon` nor `authenticated` has an insert, update or delete grant on these tables. Every write goes through `/api`, which checks the caller and then uses the service role.
- **Atomic server operations as SQL functions**, executable by the service role only: `create_room`, `join_room` (locks the room, takes the lowest free seat, idempotent for a player already seated), `start_match` (locks the room, checks host, full and still open, inserts the match and marks the room started), `consume_rate_limit`. Two players racing for the last seat, or two starts of a room, cannot both win.
- **Auth on `/api`:** the browser sends its Supabase access token as `Authorization: Bearer`; the server checks it with Supabase Auth (`auth.getUser`), which rejects forged, expired and signed-out tokens. The service-role (secret) key is read only by `server/services.ts` from `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`), never under a `VITE_` or `NEXT_PUBLIC_` name, so no build ships it.
- **The reducer on the server.** A match starts with `InitializeGame({ game: Caribbean, numPlayers, setupData })` from `boardgame.io/internal`, with the room's map size and seed as `setupData`, so the map is exactly the one the local game would generate for that seed. Moves (#113) go through `CreateGameReducer` the same way. The server is the only place the whole state exists.
- **Invite links** carry a 128-bit random code (22 base64url characters), not the room id: knowing a room's id gives nothing, and a link can be revoked later by changing its code.
- **Rate limits** are fixed-window counters in Postgres (`consume_rate_limit`), per user and action: room creation 5 an hour.
- **The function runs bundled.** Vercel transpiles function files one by one, and Node's ES modules then cannot resolve the game's extensionless relative imports or `boardgame.io/internal`. So `npm run build` ends with `build:api`, which bundles `server/vercelHandler.ts`, the game code and all dependencies into `api/_server.mjs` (git-ignored; files starting with `_` in `api/` are not functions of their own). `api/index.ts` imports it at run time, and `vercel.json` ships it with the function (`includeFiles`). Vercel runs the framework build, and so the build command, before the function builders.

## Considered options

- **A boardgame.io server (Koa + socket.io).** Rejected in PRD #104: it needs a long-lived process Vercel does not offer.
- **Clients write rooms and seats under RLS policies.** Rejected: seat assignment and starting a match must be atomic and rate-limited, and policies cannot express "the lowest free seat" or "only once full"; one writer is easier to reason about.
- **Let members read `matches.state` and strip it in the client.** Rejected: hidden information must never reach a browser (#109).
- **A separate `match_secrets` table.** Unnecessary: a column grant hides the snapshot as well, and keeps one row per match.
- **Verify the JWT locally with the project's JWT secret.** Rejected for now: one more secret to manage, and it would not notice a signed-out session. `auth.getUser` costs one call to Supabase Auth per request.
- **Add `.js` extensions throughout `src/game/`.** Rejected: it touches every game module, and `boardgame.io`'s subpath imports still fail under Node's ES modules.
- **The Build Output API (`.vercel/output`).** Kept in reserve: it would replace zero-config deployment entirely; bundling into `api/` keeps today's set-up.

## Consequences

- A migration adds tables; the maintainer applies it with `npx supabase db push` (`docs/deploy.md`).
- Every route that touches a match must return `playerViewFor(G, seat)`, never `G`; the tests assert it.
- The deployed bundle is not checked by CI: a wrong build order on Vercel would show as `/api/*` answering 500. `/api/health` exercises the same bundle, so a deploy check of it covers the wiring.
- Rate-limit windows are fixed, so a burst across a window boundary can reach twice the limit; acceptable for abuse control.
