-- A player's voyages: the rooms they hold a seat in, for leaving a match and
-- coming back to it (`GET /api/me/rooms`).
--
-- Security model, as in 20261015000000_rooms.sql:
-- * `list_voyages` is the server's: executable by the service role only. /api
--   passes the signed-in caller's id, checked with Supabase Auth.
-- * It returns only rooms `p_user` holds a seat in, and of each match no more
--   than whose turn it is and the turn's number (`ctx.currentPlayer`,
--   `ctx.turn`, while the room is started):
--   never the state itself, the invite code or the seeds.
-- * Names come from `profiles`; only user ids are stored in seats.

-- Up to `p_limit` (at most 50) of `p_user`'s rooms, the most recently changed
-- first: a match's last move, or the room's creation before it started.
create function public.list_voyages(p_user uuid, p_limit integer)
returns table (
  room_id uuid,
  status text,
  seat_count integer,
  map_size text,
  match_id uuid,
  current_seat integer,
  turn integer,
  updated_at timestamptz,
  seats jsonb
)
language sql
stable
set search_path = ''
as $$
  select
    r.id,
    r.status,
    r.seat_count,
    r.map_size,
    m.id,
    case
      when r.status = 'started' and (m.state -> 'ctx' ->> 'currentPlayer') ~ '^[0-9]$'
        then (m.state -> 'ctx' ->> 'currentPlayer')::integer
    end,
    case
      when r.status = 'started' and (m.state -> 'ctx' ->> 'turn') ~ '^[0-9]{1,9}$'
        then (m.state -> 'ctx' ->> 'turn')::integer
    end,
    coalesce(m.updated_at, r.created_at),
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('seat_index', s.seat_index, 'user_id', s.user_id, 'display_name', p.display_name)
          order by s.seat_index
        ),
        '[]'::jsonb
      )
      from public.seats s
      left join public.profiles p on p.id = s.user_id
      where s.room_id = r.id
    )
  from public.rooms r
  left join public.matches m on m.room_id = r.id
  where exists (select 1 from public.seats mine where mine.room_id = r.id and mine.user_id = p_user)
  order by coalesce(m.updated_at, r.created_at) desc, r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 0), 50);
$$;

revoke execute on function public.list_voyages(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_voyages(uuid, integer) to service_role;
