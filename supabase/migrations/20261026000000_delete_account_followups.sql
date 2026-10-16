-- Deleting an account (#108): follow-ups from #314's review.
--
-- * A deleted account is refused with one SQLSTATE, 28000
--   (invalid_authorization_specification), never recognised by an error's
--   text: `consume_rate_limit` used to fail on `rate_counters`' foreign key
--   to auth.users once the sign-in was gone, which /api could only tell from
--   the constraint's name in the message. It now raises 28000 itself, as
--   `require_live_profile` does (`storeError` in server/supabaseOnlineStore.ts).
-- * A start in progress no longer outlives a deletion: `delete_account`
--   leaves a `starting` room as it leaves an open one, and calls the start
--   off (the room reopens; the host's `start_match`, still building, then
--   finds it open, or is refused if the host is the one deleted).
-- * `release_start` never reopens a room with a deleted player still seated:
--   each leaves as `delete_account` would have them leave.
-- * `claim_start` and `start_match` refuse a deleted profile first, as
--   `create_room`, `join_room` and `commit_move` do, under the same share
--   lock on the profile, taken before the room's.
-- * `anonymise_profile` clears the seats' `last_seen_at` (#114): the seat is
--   kept, but when its player was last about is theirs.
--
-- Every function keeps its signature and runs as its caller, as before;
-- `create or replace` keeps their grants (service role only).

set local lock_timeout = '5s';

-- As in 20261015000000_rooms.sql, but a count for an auth user that is gone
-- (deleted since its token was checked) is refused as a deleted account.
-- `rate_counters.user_id` is its only foreign key.
create or replace function public.consume_rate_limit(p_user uuid, p_action text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  begin
    insert into public.rate_counters as rc (user_id, action, window_start, count)
    values (p_user, p_action, v_window, 1)
    on conflict (user_id, action, window_start) do update set count = rc.count + 1
    returning rc.count into v_count;
  exception when foreign_key_violation then
    raise exception 'the account is deleted' using errcode = '28000';
  end;
  -- Old windows are of no further use.
  delete from public.rate_counters
  where user_id = p_user and action = p_action and window_start < v_window;
  return v_count <= p_limit;
end;
$$;

-- As in 20261020000000_delete_account.sql, and the seats' last-seen times
-- cleared: the one place that knows what is personal
-- (supabase/tests/profileColumns.test.ts reads its updates of other tables
-- as the columns it clears on the rows it keeps).
create or replace function public.anonymise_profile(p_user uuid)
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

  -- #114's online dot: when the player last read or moved in each match.
  update public.seats
  set last_seen_at = null
  where user_id = p_user and last_seen_at is not null;

  -- #106's sign-in providers: which Discord and Google accounts were this player's.
  if to_regclass('public.profile_identities') is not null then
    execute format('delete from %s where profile_id = $1', 'public.profile_identities') using p_user;
  end if;
end;
$$;

-- Frees `p_user`'s seat in a room not yet started: a room left empty is
-- closed, a room they hosted passes to the lowest seat left. The caller
-- holds the room's row lock and has reopened a start in progress.
create function public.leave_room(p_room uuid, p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.seats s where s.room_id = p_room and s.user_id = p_user;
  if not exists (select 1 from public.seats s where s.room_id = p_room) then
    delete from public.rooms r where r.id = p_room;
  else
    update public.rooms r
    set host_id = (select s.user_id from public.seats s where s.room_id = p_room order by s.seat_index limit 1)
    where r.id = p_room and r.host_id = p_user;
  end if;
end;
$$;

revoke execute on function public.leave_room(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leave_room(uuid, uuid) to service_role;

-- As in 20261020000000_delete_account.sql, but a room `starting` is left as
-- an open one is: the claim is called off (the room reopens) before the seat
-- is freed, so the start being built finds it open and stores nothing.
create or replace function public.delete_account(p_user uuid)
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
    continue when v_status not in ('open', 'starting');
    update public.rooms r set status = 'open', start_claimed_at = null where r.id = v_room and r.status = 'starting';
    perform public.leave_room(v_room, p_user);
  end loop;
end;
$$;

-- As in 20261015000000_rooms.sql, refusing a deleted profile first.
create or replace function public.claim_start(p_room uuid, p_user uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_seated integer;
  v_stale boolean;
begin
  perform public.require_live_profile(p_user);
  select * into v_room from public.rooms r where r.id = p_room for update;
  if not found then
    return 'not_found';
  end if;
  v_stale := v_room.status = 'starting' and v_room.start_claimed_at < now() - interval '120 seconds';
  if v_room.status = 'starting' and not v_stale then
    return 'starting';
  end if;
  if v_room.status <> 'open' and not v_stale then
    return 'already_started';
  end if;
  if v_room.host_id is distinct from p_user then
    return 'not_host';
  end if;
  select count(*) into v_seated from public.seats s where s.room_id = p_room;
  if v_seated < v_room.seat_count then
    return 'not_full';
  end if;
  update public.rooms set status = 'starting', start_claimed_at = now() where id = p_room;
  return 'claimed';
end;
$$;

-- As in 20261015000000_rooms.sql, refusing a deleted profile first.
create or replace function public.start_match(p_room uuid, p_user uuid, p_state jsonb, p_state_id integer, p_phase text)
returns table (outcome text, match_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_match uuid;
begin
  perform public.require_live_profile(p_user);
  select * into v_room from public.rooms r where r.id = p_room for update;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if v_room.status <> 'starting' or v_room.host_id is distinct from p_user then
    return query select 'not_claimed'::text, null::uuid;
    return;
  end if;
  insert into public.matches (room_id, state, state_id, phase)
  values (p_room, p_state, p_state_id, p_phase)
  returning id into v_match;
  update public.rooms set status = 'started', start_claimed_at = null where id = p_room;
  return query select 'started'::text, v_match;
end;
$$;

-- Gives a claimed start back when building the match failed, as in
-- 20261015000000_rooms.sql; a deleted player still seated there leaves as
-- delete_account would have them leave (the room may close).
create or replace function public.release_start(p_room uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid;
begin
  update public.rooms set status = 'open', start_claimed_at = null where id = p_room and status = 'starting';
  if not found then
    return;
  end if;
  for v_user in
    select s.user_id
    from public.seats s
    join public.profiles p on p.id = s.user_id
    where s.room_id = p_room and p.deleted_at is not null
    order by s.seat_index
  loop
    perform public.leave_room(p_room, v_user);
  end loop;
end;
$$;
