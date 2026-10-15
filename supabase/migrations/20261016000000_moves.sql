-- The move log and the conditional write of a match (#113, PRD #104 Authority,
-- Concurrency and Storage; ADR 0008).
--
-- Security model:
-- * `moves` is append-only and the server's alone: its arguments can carry
--   what a seat may not know (what a ship bought, where a hidden hold went),
--   so no client reads it. Row-level security is on with no policies, and
--   anon and authenticated have no grants. Replays and spectators, when they
--   come, will read it through /api with the right view.
-- * `commit_move` is the only way a match changes: it writes the new snapshot
--   only if the match is still at the state the move was made against
--   (`state_id`), and appends the move in the same transaction. Executable by
--   the service role only.

create table public.moves (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  seat_index integer not null,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null constraint moves_kind_check check (kind in ('move', 'event')),
  name text not null,
  args jsonb not null default '[]'::jsonb,
  state_id_before integer not null,
  state_id_after integer not null,
  created_at timestamptz not null default now()
);

create index moves_match_id_idx on public.moves (match_id, id);

comment on table public.moves is 'Append-only log of accepted moves. Written and read only by /api (service role).';

alter table public.moves enable row level security;
alter table public.moves force row level security;
revoke all on table public.moves from anon, authenticated;

-- Writes the match's new state if it is still at `p_expected_state_id`, logs
-- the move, and marks the room finished when the game is over. Returns false
-- (and writes nothing) when another write got there first.
create function public.commit_move(
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

revoke execute on function public.commit_move(uuid, integer, jsonb, integer, text, boolean, integer, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_move(uuid, integer, jsonb, integer, text, boolean, integer, uuid, text, text, jsonb)
  to service_role;
