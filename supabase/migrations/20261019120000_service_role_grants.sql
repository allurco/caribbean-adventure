-- Explicit grants for the service role (#107: preview branches).
--
-- A Supabase preview branch is created without the default privileges a
-- hosted project and the local stack give on `public`, so a table the
-- earlier migrations created is out of reach of `service_role` there until
-- it is granted. `/api` reads and writes every one of these tables as the
-- service role (ADR 0008), directly or through the security-invoker
-- functions (`create_room`, `join_room`, `claim_start`, `start_match`,
-- `release_start`, `consume_rate_limit`, `commit_move`, `list_voyages`).
--
-- On production and the local stack these privileges are already held, so
-- this changes nothing there. Clients gain nothing: `anon` and
-- `authenticated` keep exactly the grants the earlier migrations gave them.
-- `moves.id` is an identity column, whose sequence needs no grant of its own.
--
-- A new table needs the same: `supabase/tests/branchGrants.test.ts` fails
-- until it is granted to the service role.

grant select, insert, update, delete on table
  public.profiles,
  public.rooms,
  public.seats,
  public.matches,
  public.rate_counters,
  public.moves
to service_role;
