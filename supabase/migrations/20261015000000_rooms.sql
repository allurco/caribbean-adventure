-- Rooms, seats and matches (#112, PRD #104), and the per-user rate counters.
--
-- Security model:
-- * Clients never write these tables. Every write goes through `/api`, which
--   checks who is asking and then uses the service role (the functions below
--   are executable by the service role only). There are no insert, update or
--   delete grants for anon or authenticated, and no policies that would allow
--   them.
-- * A signed-in player reads only the rooms they hold a seat in, those
--   rooms' seats, and those rooms' match rows. Signed-out visitors read
--   nothing. A room's existence is not revealed to anyone else: joining is by
--   its invite code, through `/api`.
-- * `matches.state` is the full boardgame.io state, hidden information
--   included (every hand, every hold, the random seed). No client may read
--   it: the column is left out of the select grant. Players get their own
--   view (`playerViewFor`) from `/api`, never the snapshot.
-- * `rate_counters` is the server's alone: no grants, no policies.
-- * Only user ids are stored here; names come from `profiles` and provider
--   ids stay in `auth.identities`.

-- The game's limits (src/game/seats.ts MAX_SEATS, mapConfig sizes): kept in
-- step by the API, which checks them before it writes.
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references auth.users (id) on delete set null,
  invite_code text not null unique
    constraint rooms_invite_code_check check (invite_code ~ '^[A-Za-z0-9_-]{22}$'),
  visibility text not null default 'private'
    constraint rooms_visibility_check check (visibility in ('private', 'public')),
  ranked boolean not null default false,
  seat_count integer not null
    constraint rooms_seat_count_check check (seat_count between 2 and 4),
  map_size text not null
    constraint rooms_map_size_check check (map_size in ('small', 'medium', 'large')),
  map_seed integer not null,
  turn_timer_seconds integer not null default 86400
    constraint rooms_turn_timer_check check (turn_timer_seconds between 60 and 604800),
  status text not null default 'open'
    constraint rooms_status_check check (status in ('open', 'started', 'finished')),
  created_at timestamptz not null default now()
);

comment on table public.rooms is 'Match rooms: settings, invite code and status. Written only by /api (service role).';

create table public.seats (
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- The boardgame.io playerID is this index as text ("0", "1", ...).
  seat_index integer not null
    constraint seats_seat_index_check check (seat_index between 0 and 3),
  user_id uuid not null references auth.users (id) on delete cascade,
  missed_turns integer not null default 0,
  status text not null default 'active'
    constraint seats_status_check check (status in ('active', 'dropped')),
  joined_at timestamptz not null default now(),
  primary key (room_id, seat_index),
  constraint seats_one_per_player unique (room_id, user_id)
);

create index seats_user_id_idx on public.seats (user_id);

comment on table public.seats is 'Who holds which seat of a room. Written only by /api (service role).';

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms (id) on delete cascade,
  -- The full boardgame.io state: never readable by a client (see the grants).
  state jsonb not null,
  -- boardgame.io's _stateID: every write is conditional on it (#113).
  state_id integer not null,
  phase text,
  turn_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.matches is 'Match state snapshots. Written only by /api (service role); clients read their view through /api.';

create table public.rate_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, action, window_start)
);

comment on table public.rate_counters is 'Per-user fixed-window rate limits, counted by /api. Server only.';

-- Membership, for the policies: security definer so a policy on seats can ask
-- about seats without recursing into its own policy. It answers only for the
-- caller (auth.uid()), so it reveals nothing about anyone else.
create function public.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.seats s
    where s.room_id = p_room and s.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

alter table public.rooms enable row level security;
alter table public.seats enable row level security;
alter table public.matches enable row level security;
alter table public.rate_counters enable row level security;

create policy "Members read their rooms"
  on public.rooms for select
  to authenticated
  using (public.is_room_member(id));

create policy "Members read their rooms' seats"
  on public.seats for select
  to authenticated
  using (public.is_room_member(room_id));

create policy "Members read their rooms' match rows"
  on public.matches for select
  to authenticated
  using (public.is_room_member(room_id));

revoke all on table public.rooms, public.seats, public.matches, public.rate_counters from anon, authenticated;
grant select on table public.rooms, public.seats to authenticated;
-- Everything but the state itself.
grant select (id, room_id, state_id, phase, turn_deadline, created_at, updated_at) on table public.matches to authenticated;

-- ---------------------------------------------------------------------------
-- The server's operations. Each runs as one transaction, so two players
-- racing for the last seat, or two starts of one room, cannot both win.
-- Callable only with the service role (revoked from everyone else below).
-- ---------------------------------------------------------------------------

-- One more use of `p_action` by `p_user` in the current fixed window of
-- `p_window_seconds`; true while the count stays within `p_limit`.
create function public.consume_rate_limit(p_user uuid, p_action text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_counters as rc (user_id, action, window_start, count)
  values (p_user, p_action, v_window, 1)
  on conflict (user_id, action, window_start) do update set count = rc.count + 1
  returning rc.count into v_count;
  -- Old windows are of no further use.
  delete from public.rate_counters
  where user_id = p_user and action = p_action and window_start < v_window;
  return v_count <= p_limit;
end;
$$;

-- A new private room with its host in seat 0. Returns the room's id.
create function public.create_room(
  p_host uuid,
  p_invite_code text,
  p_seat_count integer,
  p_map_size text,
  p_map_seed integer,
  p_turn_timer_seconds integer
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_room uuid;
begin
  insert into public.rooms (host_id, invite_code, seat_count, map_size, map_seed, turn_timer_seconds)
  values (p_host, p_invite_code, p_seat_count, p_map_size, p_map_seed, p_turn_timer_seconds)
  returning id into v_room;
  insert into public.seats (room_id, seat_index, user_id) values (v_room, 0, p_host);
  return v_room;
end;
$$;

-- Seats `p_user` in the room with `p_invite_code`, at its lowest free seat.
-- Returns (outcome, room_id): 'seated' (newly or already), 'not_found',
-- 'full', or 'started' (the match began without them).
create function public.join_room(p_invite_code text, p_user uuid)
returns table (outcome text, room_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_free integer;
begin
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

-- Starts the room's match with the state the server built. Returns
-- (outcome, match_id): 'started', 'not_found', 'not_host', 'not_full', or
-- 'already_started' (with the existing match's id).
create function public.start_match(p_room uuid, p_user uuid, p_state jsonb, p_state_id integer, p_phase text)
returns table (outcome text, match_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_seated integer;
  v_match uuid;
begin
  select * into v_room from public.rooms r where r.id = p_room for update;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if v_room.status <> 'open' then
    select m.id into v_match from public.matches m where m.room_id = p_room;
    return query select 'already_started'::text, v_match;
    return;
  end if;
  if v_room.host_id is distinct from p_user then
    return query select 'not_host'::text, null::uuid;
    return;
  end if;
  select count(*) into v_seated from public.seats s where s.room_id = p_room;
  if v_seated < v_room.seat_count then
    return query select 'not_full'::text, null::uuid;
    return;
  end if;
  insert into public.matches (room_id, state, state_id, phase)
  values (p_room, p_state, p_state_id, p_phase)
  returning id into v_match;
  update public.rooms set status = 'started' where id = p_room;
  return query select 'started'::text, v_match;
end;
$$;

revoke execute on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.create_room(uuid, text, integer, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.join_room(text, uuid) from public, anon, authenticated;
revoke execute on function public.start_match(uuid, uuid, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;
grant execute on function public.create_room(uuid, text, integer, text, integer, integer) to service_role;
grant execute on function public.join_room(text, uuid) to service_role;
grant execute on function public.start_match(uuid, uuid, jsonb, integer, text) to service_role;
