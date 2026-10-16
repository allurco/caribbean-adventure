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
--   column grants are display_name, and avatar_url until #106 revokes it),
--   and once it is set the owner's update policy no longer matches: an access
--   token that outlives the deletion cannot rename the placeholder or give it
--   an avatar.
-- * Once it is set, a trigger holds the placeholder whatever writes the row
--   later (the service role, another table's trigger such as #106's
--   handle_identity_change): the name stays "Deleted player", the avatar
--   null, and `deleted_at` cannot be cleared.
-- * "Deleted player" is reserved for the placeholder: a check refuses it on
--   a live profile, whatever its case, and the sign-up trigger never gives it.
-- * `anonymise_profile` is the one place that knows what is personal. It
--   lists every column of the table as kept or cleared, and every table that
--   references a profile as kept (the match records) or cleared (#106's
--   `profile_identities`, whose rows it deletes when the table exists), and
--   refuses to run if it meets a column or a referencing table it does not
--   list, so neither can survive a deletion unnoticed;
--   `supabase/tests/profileColumns.test.ts` fails on such a migration first.
-- * `delete_account` is the server's: executable by the service role only.
--   /api passes the signed-in caller's id, checked with Supabase Auth, never
--   one from a request's body.
-- * A deleted profile cannot act through /api, even while its sign-in
--   lingers (the profile is anonymised before the sign-in is removed):
--   `create_room`, `join_room` and `commit_move` refuse it, under a share
--   lock on the profile row, so a join cannot slip in beside a deletion.
-- * Deleting an auth user any other way (the dashboard, the admin API) runs
--   the same `delete_account` from a trigger, in the deletion's transaction,
--   so no path leaves a profile with its personal fields behind. The trigger
--   runs as the tables' owner, which must bypass row-level security (rooms
--   force it); `delete_account` raises rather than skip a room it cannot see.
--
-- On live data: the backfill and the check tolerate rows already there, and
-- a lock the migration cannot take within five seconds fails it rather than
-- stalling every sign-in and move behind it.

set local lock_timeout = '5s';

-- Every auth user has a profile (the sign-up trigger makes one), so the seats
-- and rooms below can point at profiles. Fill any gap first, as the trigger
-- would have, so the new foreign keys cannot fail on an old row.
insert into public.profiles (id, display_name)
select u.id, 'Captain ' || left(replace(u.id::text, '-', ''), 6)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

alter table public.profiles drop constraint profiles_id_fkey;

alter table public.profiles add column deleted_at timestamptz;

comment on column public.profiles.deleted_at is 'Set when the account was deleted (#108): the row is then the "deleted player" placeholder.';

-- The placeholder's name is reserved. A live profile that took it already
-- gets the sign-up trigger's placeholder instead, before the check is added,
-- so the check cannot fail on an old row.
update public.profiles
set display_name = 'Captain ' || left(replace(id::text, '-', ''), 6)
where deleted_at is null and lower(display_name) = lower('Deleted player');

alter table public.profiles
  add constraint profiles_display_name_reserved check (lower(display_name) <> lower('Deleted player') or deleted_at is not null);

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

-- A new auth user gets a profile, as in 20261014000000_profiles.sql and as
-- #106 (20261019000000_profile_identities.sql) left it, except that a
-- provider's name equal to the reserved placeholder (any case) is treated as
-- no name: the sign-up never fails on the check above. As in #106, the
-- avatar is taken only from a Discord or Google sign-up, never from an email
-- or one-time-code sign-up's own metadata (profileColumns.test.ts holds it).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provided_name text := btrim(left(btrim(regexp_replace(regexp_replace(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'user_name',
    ''
  ), '[[:space:]]+', ' ', 'g'), '[[:cntrl:]]', '', 'g')), 32));
  provided_avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    case
      when provided_name = '' or lower(provided_name) = lower('Deleted player')
        then 'Captain ' || left(replace(new.id::text, '-', ''), 6)
      else provided_name
    end,
    case
      when new.raw_app_meta_data ->> 'provider' in ('discord', 'google')
        and char_length(provided_avatar) <= 2048 and provided_avatar ~ '^https://[^[:space:][:cntrl:]]+$'
        then provided_avatar
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Turns the profile into the "deleted player" placeholder and deletes the
-- rows of every table that holds something personal about the player.
-- Every column of public.profiles is named below, as kept or cleared, and
-- every table with a foreign key to it, as kept (match records, which go on
-- naming the placeholder) or cleared; a column or a table in neither list
-- stops it, so nothing new that is personal is ever left behind. A cleared
-- table may not exist yet (#106's profile_identities, merged in either order
-- with this one): it is deleted from only when it does. Idempotent: a second
-- run changes nothing (the deletion keeps its first time).
-- The name is `DELETED_PLAYER_NAME` in src/online/displayName.ts.
-- Runs as its caller, not as a security definer: its two callers already
-- bypass row-level security (the service role through delete_account, and
-- the deletion trigger as the tables' owner).
create function public.anonymise_profile(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_kept constant text[] := array['id', 'created_at', 'updated_at', 'deleted_at'];
  v_cleared constant text[] := array['display_name', 'avatar_url'];
  v_kept_tables constant text[] := array['public.seats', 'public.rooms', 'public.moves'];
  v_cleared_tables constant text[] := array['public.profile_identities'];
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

  select string_agg(distinct c.conrelid::regclass::text, ', ') into v_unknown
  from pg_catalog.pg_constraint c
  where c.contype = 'f'
    and c.confrelid = 'public.profiles'::regclass
    and not (c.conrelid::regclass::text = any (v_kept_tables || v_cleared_tables));
  if v_unknown is not null then
    raise exception 'anonymise_profile does not know the table(s) % that reference profiles: list each as kept or cleared', v_unknown;
  end if;

  update public.profiles
  set display_name = 'Deleted player', avatar_url = null, deleted_at = coalesce(deleted_at, now())
  where id = p_user;

  -- #106's sign-in providers: which Discord and Google accounts were this player's.
  if to_regclass('public.profile_identities') is not null then
    execute format('delete from %s where profile_id = $1', 'public.profile_identities') using p_user;
  end if;
end;
$$;

-- Holds a deleted profile's placeholder against any later write: whatever
-- an update sets, the name stays the placeholder, the avatar null, and the
-- deletion's time as it was. Every column anonymise_profile clears is held
-- here (profileColumns.test.ts checks it).
create function public.keep_deleted_profile_anonymous()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    new.display_name := 'Deleted player';
    new.avatar_url := null;
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_deleted_profile_anonymous() from public, anon, authenticated;

create trigger profiles_keep_deleted_anonymous
  before update on public.profiles
  for each row execute function public.keep_deleted_profile_anonymous();

-- Refuses a player whose profile is the placeholder, or missing: raised as
-- invalid_authorization_specification (28000), which /api answers with 401
-- (`storeError` in server/supabaseOnlineStore.ts). The share lock on the
-- profile row makes the caller wait for a deletion in progress, and makes a
-- deletion wait for the caller, so neither interleaves with the other.
-- Called first, before any room or match row is locked, so the locks are
-- always taken profile first, as delete_account takes them.
create function public.require_live_profile(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_deleted_at timestamptz;
begin
  select p.deleted_at into v_deleted_at from public.profiles p where p.id = p_user for share;
  if not found or v_deleted_at is not null then
    raise exception 'the account is deleted' using errcode = '28000';
  end if;
end;
$$;

-- create_room, join_room and commit_move as in 20261015000000_rooms.sql and
-- 20261016000000_moves.sql, each refusing a deleted profile first.
create or replace function public.create_room(
  p_host uuid,
  p_invite_code text,
  p_seat_count integer,
  p_map_size text,
  p_map_seed integer,
  p_turn_timer_seconds integer,
  p_limit integer,
  p_window_seconds integer
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_room uuid;
begin
  perform public.require_live_profile(p_host);
  if not public.consume_rate_limit(p_host, 'create_room', p_limit, p_window_seconds) then
    return null;
  end if;
  insert into public.rooms (host_id, invite_code, seat_count, map_size, map_seed, turn_timer_seconds)
  values (p_host, p_invite_code, p_seat_count, p_map_size, p_map_seed, p_turn_timer_seconds)
  returning id into v_room;
  insert into public.seats (room_id, seat_index, user_id) values (v_room, 0, p_host);
  return v_room;
end;
$$;

create or replace function public.join_room(p_invite_code text, p_user uuid)
returns table (outcome text, room_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_free integer;
begin
  perform public.require_live_profile(p_user);
  select * into v_room from public.rooms r where r.invite_code = p_invite_code for update;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if exists (select 1 from public.seats s where s.room_id = v_room.id and s.user_id = p_user) then
    return query select 'seated'::text, v_room.id;
    return;
  end if;
  if v_room.status <> 'open' then
    return query select 'started'::text, v_room.id;
    return;
  end if;
  select min(i) into v_free
  from generate_series(0, v_room.seat_count - 1) as i
  where not exists (select 1 from public.seats s where s.room_id = v_room.id and s.seat_index = i);
  if v_free is null then
    return query select 'full'::text, v_room.id;
    return;
  end if;
  insert into public.seats (room_id, seat_index, user_id) values (v_room.id, v_free, p_user);
  return query select 'seated'::text, v_room.id;
end;
$$;

create or replace function public.commit_move(
  p_match uuid,
  p_expected_state_id integer,
  p_state jsonb,
  p_state_id integer,
  p_phase text,
  p_finished boolean,
  p_seat integer,
  p_user uuid,
  p_kind text,
  p_name text,
  p_args jsonb
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_room uuid;
begin
  perform public.require_live_profile(p_user);
  update public.matches
  set state = p_state, state_id = p_state_id, phase = p_phase, updated_at = now()
  where id = p_match and state_id = p_expected_state_id
  returning room_id into v_room;
  if not found then
    return false;
  end if;
  insert into public.moves (match_id, seat_index, user_id, kind, name, args, state_id_before, state_id_after)
  values (p_match, p_seat, p_user, p_kind, p_name, p_args, p_expected_state_id, p_state_id);
  if p_finished then
    update public.rooms set status = 'finished' where id = v_room;
  end if;
  return true;
end;
$$;

-- Anonymises the profile and leaves every room still open, in one
-- transaction. In an open room the seat is freed; a room they hosted passes
-- to the lowest seat left; a room nobody is left in is closed. A room
-- starting, started or finished keeps the seat, the host and the move log as
-- they are, under the placeholder. Idempotent.
-- Runs as its caller, as the rooms functions do: the service role, or the
-- deletion trigger below as the tables' owner; either must bypass row-level
-- security. It walks the player's seats (`seats` does not force row-level
-- security, so its owner always sees them) and locks each seat's room;
-- a room it cannot see means row-level security hid it, and it raises
-- rather than leave the seat behind.
create function public.delete_account(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room uuid;
  v_status text;
begin
  -- The profile first: join_room and the others take their share lock on it
  -- before any room, so the locks are always taken in the same order.
  perform public.anonymise_profile(p_user);
  -- Each room locked as join_room and claim_start lock it, so a start or a
  -- join cannot race the leaving; in room order, so two deletions cannot
  -- deadlock.
  for v_room in
    select s.room_id from public.seats s where s.user_id = p_user order by s.room_id
  loop
    select r.status into v_status from public.rooms r where r.id = v_room for update;
    if not found then
      raise exception 'delete_account cannot see room % (row-level security?): it must run as a role that bypasses it', v_room;
    end if;
    continue when v_status <> 'open';
    delete from public.seats s where s.room_id = v_room and s.user_id = p_user;
    if not exists (select 1 from public.seats s where s.room_id = v_room) then
      delete from public.rooms r where r.id = v_room;
    else
      update public.rooms r
      set host_id = (select s.user_id from public.seats s where s.room_id = v_room order by s.seat_index limit 1)
      where r.id = v_room and r.host_id = p_user;
    end if;
  end loop;
end;
$$;

revoke execute on function public.anonymise_profile(uuid) from public, anon, authenticated;
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
revoke execute on function public.require_live_profile(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_profile(uuid) to service_role;
grant execute on function public.delete_account(uuid) to service_role;
grant execute on function public.require_live_profile(uuid) to service_role;

-- Whatever deletes the auth user, the profile is anonymised in the same
-- transaction. /api has run delete_account already (a no-op the second time).
-- security definer: the auth service deletes the user, and has no grant on
-- these tables; it runs as the owner, which bypasses row-level security on
-- Supabase (`rolbypassrls`, which deleteAccount.rls.test.ts checks), as the
-- sign-up trigger does. Should it ever not, delete_account raises and the
-- deletion fails, rather than leave a seat in an open room behind.
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
