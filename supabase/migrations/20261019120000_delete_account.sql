-- Deleting an account (#108, PRD #104 Identity): the account is anonymised,
-- not erased. The profile stays as a "deleted player" placeholder, so match
-- records and the other captains' histories still name the seat; the sign-in
-- identity (auth.users and its auth.identities) is removed, so signing in
-- again with the same email or provider makes a new profile.
--
-- Until now the profile, the seats and the move log hung off auth.users:
-- `profiles.id` and `seats.user_id` with `on delete cascade`, so deleting the
-- sign-in would have erased the profile and every seat the player held,
-- started matches included. Here they hang off the profile instead, which is
-- never deleted:
-- * `profiles.id` no longer references auth.users. A profile is still made
--   only by the sign-up trigger, with the new auth user's id.
-- * `seats.user_id`, `rooms.host_id` and `moves.user_id` reference
--   `profiles (id)`, `on delete restrict`: nothing can erase a profile that a
--   room, a seat or a logged move names.
-- * `rate_counters` keeps its cascade from auth.users: server bookkeeping,
--   nothing anyone reads back.
--
-- Security model:
-- * `profiles.deleted_at` marks the placeholder. No client may write it (the
--   column grants stay display_name and avatar_url), and once it is set the
--   owner's update policy no longer matches: an access token that outlives
--   the deletion cannot rename the placeholder or give it an avatar.
-- * `anonymise_profile` is the one place that knows which columns are
--   personal. It lists every column of the table as kept or cleared and
--   refuses to run if the table has one it does not list, so a column added
--   later (a provider's id, #106) cannot survive a deletion unnoticed;
--   `supabase/tests/profileColumns.test.ts` fails on such a migration first.
-- * `delete_account` is the server's: executable by the service role only.
--   /api passes the signed-in caller's id, checked with Supabase Auth, never
--   one from a request's body.
-- * Deleting an auth user any other way (the dashboard, the admin API) runs
--   the same `delete_account` from a trigger, in the deletion's transaction,
--   so no path leaves a profile with its personal fields behind.

-- Every auth user has a profile (the sign-up trigger makes one), so the seats
-- and rooms below can point at profiles. Fill any gap first, as the trigger
-- would have, so the new foreign keys cannot fail on an old row.
insert into public.profiles (id, display_name)
select u.id, 'Captain ' || left(replace(u.id::text, '-', ''), 6)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

alter table public.profiles drop constraint profiles_id_fkey;

alter table public.profiles add column deleted_at timestamptz;

comment on column public.profiles.deleted_at is 'Set when the account was deleted (#108): the row is then the "deleted player" placeholder.';

alter table public.seats
  drop constraint seats_user_id_fkey,
  add constraint seats_user_id_fkey foreign key (user_id) references public.profiles (id) on delete restrict;

alter table public.rooms
  drop constraint rooms_host_id_fkey,
  add constraint rooms_host_id_fkey foreign key (host_id) references public.profiles (id) on delete restrict;

alter table public.moves
  drop constraint moves_user_id_fkey,
  add constraint moves_user_id_fkey foreign key (user_id) references public.profiles (id) on delete restrict;

-- The owner edits their profile only while it is theirs: not the placeholder.
drop policy "A player updates only their own profile" on public.profiles;

create policy "A player updates only their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id and deleted_at is null)
  with check ((select auth.uid()) = id and deleted_at is null);

-- Turns the profile into the "deleted player" placeholder. Every column of
-- public.profiles is named below, as kept or cleared; a column in neither list
-- stops it, so a new personal column is never left behind. Idempotent: a
-- second run changes nothing (the deletion keeps its first time).
-- The name is `DELETED_PLAYER_NAME` in src/online/displayName.ts.
create function public.anonymise_profile(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kept constant text[] := array['id', 'created_at', 'updated_at', 'deleted_at'];
  v_cleared constant text[] := array['display_name', 'avatar_url'];
  v_unknown text;
begin
  select string_agg(a.attname, ', ' order by a.attname) into v_unknown
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass
    and a.attnum > 0
    and not a.attisdropped
    and not (a.attname = any (v_kept || v_cleared));
  if v_unknown is not null then
    raise exception 'anonymise_profile does not know the profiles column(s) %: list each as kept or cleared', v_unknown;
  end if;

  update public.profiles
  set display_name = 'Deleted player', avatar_url = null, deleted_at = coalesce(deleted_at, now())
  where id = p_user;
end;
$$;

-- Anonymises the profile and leaves every room still open, in one
-- transaction. In an open room the seat is freed; a room they hosted keeps no
-- host (its lobby then says the match cannot be started); a room nobody is
-- left in is closed. A room starting, started or finished keeps the seat, the
-- host and the move log as they are, under the placeholder. Idempotent.
-- Runs as its caller, as the rooms functions do: the service role, which
-- bypasses row-level security, or the deletion trigger below.
create function public.delete_account(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room uuid;
begin
  perform public.anonymise_profile(p_user);
  -- Each open room locked as join_room and claim_start lock it, so a start
  -- or a join cannot race the leaving.
  for v_room in
    select r.id
    from public.rooms r
    where r.status = 'open'
      and exists (select 1 from public.seats s where s.room_id = r.id and s.user_id = p_user)
    order by r.id
    for update of r
  loop
    delete from public.seats s where s.room_id = v_room and s.user_id = p_user;
    update public.rooms r set host_id = null where r.id = v_room and r.host_id = p_user;
    delete from public.rooms r
    where r.id = v_room and not exists (select 1 from public.seats s where s.room_id = v_room);
  end loop;
end;
$$;

revoke execute on function public.anonymise_profile(uuid) from public, anon, authenticated;
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_profile(uuid) to service_role;
grant execute on function public.delete_account(uuid) to service_role;

-- Whatever deletes the auth user, the profile is anonymised in the same
-- transaction. /api has run delete_account already (a no-op the second time).
-- security definer: the auth service deletes the user, and has no grant on
-- these tables; it runs as the owner, which bypasses row-level security on
-- Supabase, as the sign-up trigger does.
create function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.delete_account(old.id);
  return old;
end;
$$;

revoke execute on function public.handle_deleted_user() from public, anon, authenticated;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_user();
