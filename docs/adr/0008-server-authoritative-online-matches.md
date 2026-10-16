---
status: proposed
---

# Server-authoritative online matches: `/api` runs the reducer, Postgres holds the state, clients read only their view

Online play (PRD #104) has no boardgame.io server: the backend is one Vercel Function (`api/index.ts`) and Supabase. Rooms (#112) are the first slice that writes game data, so they settle how the server runs the game, where match state lives, who may read and write it, and how `/api` knows who is calling. We decided that **`/api` is the only writer of rooms, seats and matches; it builds and advances matches with boardgame.io's own reducer over the shared `src/game/` code; Postgres keeps the whole state where no client can read it; and each player receives only `playerViewFor(G, seat)`.**

## Decision

- **Tables** (`supabase/migrations/*_rooms.sql`): `rooms` (settings, invite code, status), `seats` (room, seat index = boardgame.io `playerID`, user), `matches` (one per room: the whole boardgame.io `State` as `jsonb`, `state_id`, phase, turn deadline) and `rate_counters`. Only user ids are stored; names come from `profiles`, provider ids stay in `auth.identities` (as in #105).
- **Row-level security on every table**, forced on `rooms`, `matches` and `rate_counters` so even their owner goes through the policies (not on `seats`, which `is_room_member` reads as its owner). A signed-in player reads the rooms they hold a seat in, those rooms' seats, and those rooms' `matches` rows *without* `state`: the column is left out of the select grant, so the snapshot, with every hand, hold and the random seed, is unreadable from any client. Signed-out visitors read nothing. Membership is asked through a `security definer` function (`is_room_member`) that answers only for `auth.uid()`, so the seats policy does not recurse.
- **No client writes.** Neither `anon` nor `authenticated` has an insert, update or delete grant on these tables. Every write goes through `/api`, which checks the caller and then uses the service role.
- **Atomic server operations as SQL functions**, executable by the service role only:
  - `create_room` counts the host's allowance in the same transaction, so a failed creation costs nothing.
  - `join_room` locks the room and takes the lowest free seat; it is idempotent for a player already seated.
  - `claim_start` locks the room, checks the host, a full room and that it is still open, and marks it `starting` **before** `/api` builds the match. A second start is refused without generating a second map. A claim older than two minutes is stale and may be claimed again; `release_start` gives a claim back when building fails.
  - `start_match` stores the claimed start's match and marks the room started.
  - `consume_rate_limit`.

  Two players racing for the last seat, or two starts of a room, cannot both win.
- **The match's random seed is 128 random bits** from the server (`newMatchSeed`), passed as the game's `seed`. boardgame.io's default, `Date.now()` in base 36, could be guessed from the match's creation time (which members can read) and replayed offline to reveal the deck, every hand and every die roll. Every view drops the seed (the random plugin's `playerView`).
- **Refusals carry a stable `code`** (`ApiErrorCode` in `server/http.ts`) for clients to act on, beside a sentence that may change.
- **Auth on `/api`:** the browser sends its Supabase access token as `Authorization: Bearer`; the server checks it with Supabase Auth (`auth.getUser`), which rejects forged, expired and signed-out tokens. The service-role (secret) key is read only by `server/services.ts` from `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`), never under a `VITE_` or `NEXT_PUBLIC_` name, so no build ships it.
- **The reducer on the server.** A match starts with `InitializeGame({ game: { ...Caribbean, seed }, numPlayers, setupData })` from `boardgame.io/internal`, with the room's map size and seed as `setupData`, so the map is exactly the one the local game would generate for that seed. Moves (#113) go through `CreateGameReducer` the same way. The server is the only place the whole state exists.
- **Invite links** carry a 128-bit random code (22 base64url characters), not the room id: knowing a room's id gives nothing, and a link can be revoked later by changing its code.
- **Rate limits** are fixed-window counters in Postgres (`consume_rate_limit`), per user and action: room creation 5 an hour.
- **The function runs bundled.** Vercel transpiles function files one by one, and Node's ES modules then cannot resolve the game's extensionless relative imports or `boardgame.io/internal`. So `npm run build` ends with `build:api`, which bundles `server/vercelHandler.ts`, the game code and all dependencies into `api/_server.mjs` (git-ignored; files starting with `_` in `api/` are not functions of their own). `api/index.ts` imports it at run time, and `vercel.json` ships it with the function (`includeFiles`). Vercel runs the framework build, and so the build command, before the function builders.

- **The move pipeline (#113).** `POST /api/matches/:id/actions` carries `{ stateID, action }`. In order, the server:
  1. refuses a body over 4 KiB with 413, before parsing it. Vercel buffers the body before the function runs, so this bounds parsing and memory, not what crosses the network;
  2. answers 404 to an id that is not a UUID;
  3. counts the action against the player's limits (10 a second, 120 a minute);
  4. loads the match, and answers 404 unless the caller holds a seat;
  5. answers 400 to a body without a numeric `stateID`, and 409 `match_over` once the game has ended;
  6. refuses (403 `not_your_turn`) any seat that may not act now (`seatMayActNow`): in a fight, only the seat that presses the current step (`combatActor` in `src/game/combatActor.ts`, the rule the board's seat views read too), so the attacker can never choose for the defender; otherwise as boardgame.io's `isPlayerActive` (a seat in `activePlayers` when set, else the current player);
  7. refuses a stale `stateID` with 409 and the seat's current view;
  8. accepts only `MAKE_MOVE` of a move the game defines as its own key (top-level or a phase's; never `__proto__`, `constructor` and the like), with at most 4 arguments, or `GAME_EVENT` `endTurn` in the `main` phase. No other event (`setPhase`, `endPhase`, `endGame`, `setActivePlayers`, stages), no undo or redo, no plugin action, no `playerID` but the caller's own;
  9. runs boardgame.io's `CreateGameReducer`, and a move the game refuses is a 400;
  10. writes with `commit_move`: `UPDATE … WHERE state_id = $old`, plus the `moves` log row, in one transaction. The loser of a race gets 409.

  The server runs `withSeatedCombat(Caribbean)` (`src/game/seatedCombat.ts`): the same game, with each combat move refused unless its `playerID` is the step's actor, so the moves themselves enforce the rule even if a route check were missed. The hotseat game is unwrapped, because boardgame.io's seatless client sends every move as the current player and one table presses both sides.

  `GET /api/matches/:id` counts against a read limit (60 a minute per player, four times the 4-second poll), and `?since=` is answered from the state id and seats alone, without loading the state.

  The stored state keeps no deltalog and no undo or redo history (undo is never allowed online), so nothing in it grows per move. Every response is `viewFor(state, seat)`: `playerViewFor` on `G`, the plugins' own views (the random seed removed), no log.
- **A player's voyages.** `GET /api/me/rooms` lists the rooms the caller holds a seat in (at most the 50 most recently changed, 30 reads a minute), through `list_voyages` (service role only), so a captain can leave a match and come back to it. Of each match under way it carries no more than whose turn it is, its phase, and of a fight on only what says whose step it is (`ctx.currentPlayer`, the match's `phase`, and `G.combat`'s stage, attacker, draw winner and whether the foe is an NPC, which every seat already sees), read inside Postgres; `/api` names the seat that may act with `combatActor`, as the move check does: never the state, the invite code, the seeds or another captain's account id.
- **`moves` is the server's alone**: its arguments can carry what a seat may not know, so no client reads it (row-level security on and forced, no grants).
- **The browser side** is boardgame.io's own `Client` with a custom transport (`src/online/apiTransport.ts`, the one class in the online code, as boardgame.io requires a `Transport` subclass), delegating to the pure `matchSync.ts`. Actions are sent one at a time; the server's view replaces the client's state, unless it is older than the one shown (a late poll); a refusal refetches the view, and after a send that failed on the way the client asks for the whole view until a read succeeds, so a move the server never got does not stay on the board. The client asks `GET /api/matches/:id?since=<stateID>` every 4 s and fetches the view only when it changed, until realtime (#114) replaces the polling.

## Considered options

- **A boardgame.io server (Koa + socket.io).** Rejected in PRD #104: it needs a long-lived process Vercel does not offer.
- **Clients write rooms and seats under RLS policies.** Rejected: seat assignment and starting a match must be atomic and rate-limited, and policies cannot express "the lowest free seat" or "only once full"; one writer is easier to reason about.
- **Let members read `matches.state` and strip it in the client.** Rejected: hidden information must never reach a browser (#109).
- **A separate `match_secrets` table.** Unnecessary: a column grant hides the snapshot as well, and keeps one row per match.
- **Verify the JWT locally with the project's JWT secret.** Rejected for now: one more secret to manage, and it would not notice a signed-out session. `auth.getUser` costs one call to Supabase Auth per request.
- **Turn boardgame.io's client events off in the `Game` config** (`events: { setPhase: false, … }`). Rejected: the game's own moves call `events.setPhase` and `events.endTurn`, and the config switches an event off for moves as well. The server's allowlist refuses them from clients instead; the local hotseat client still trusts its one player.
- **Add `.js` extensions throughout `src/game/`.** Rejected: it touches every game module, and `boardgame.io`'s subpath imports still fail under Node's ES modules.
- **The Build Output API (`.vercel/output`).** Kept in reserve: it would replace zero-config deployment entirely; bundling into `api/` keeps today's set-up.

## Consequences

- A migration adds tables; the maintainer applies it with `npx supabase db push` (`docs/deploy.md`).
- Every route that touches a match must return `playerViewFor(G, seat)`, never `G`; the tests assert it.
- The deployed bundle is not checked by CI: a wrong build order on Vercel would show as `/api/*` answering 500. `/api/health` exercises the same bundle, so a deploy check of it covers the wiring.
- Rate-limit windows are fixed, so a burst across a window boundary can reach twice the limit; acceptable for abuse control.
- A room whose host deletes their account keeps `host_id` null and loses the host's seat (both cascade): others may still join, but nobody can start it. The lobby says so. Host handover or room expiry belongs to a later slice (turn timers and the cron sweep).
