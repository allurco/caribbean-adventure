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
-- `supabase/tests/branchGrants.test.ts` reads every migration and fails when
-- a table in `public` is not fully granted to the service role.

grant select, insert, update, delete on table
  public.profiles,
  public.rooms,
  public.seats,
  public.matches,
  public.rate_counters,
  public.moves
to service_role;

-- `public.profile_identities` (OAuth, #106) comes from a migration that may
-- be merged before or after this one; grant it here when it already exists.
do $$
begin
  if to_regclass('public.profile_identities') is not null then
    execute 'grant select, insert, update, delete on public.profile_identities to service_role';
  end if;
end $$;

-- Every table a later migration creates. Default privileges apply to objects
-- created by the role named; Supabase runs migrations, on branches as on the
-- local stack and production, as `postgres`.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
