-- A player's voyages, second cut (#301 review): `list_voyages` now says who
-- may act in a fight and whether a match is drafting, and drops the turn's
-- number (`ctx.turn` counts the draft and every phase start, so a round made
-- from it drifted after each fight).
--
-- In a fight boardgame.io keeps the attacker as `ctx.currentPlayer`; the seat
-- that may act is `combatActor(G.combat)` (src/game/combatActor.ts), which
-- /api works out from the projection returned here.
--
-- Security model, as in 20261017000000_voyages.sql:
-- * `list_voyages` is the server's: executable by the service role only. /api
--   passes the signed-in caller's id, checked with Supabase Auth.
-- * It returns only rooms `p_user` holds a seat in, and of each match under
--   way (status `started`; null otherwise) no more than whose turn it is
--   (`ctx.currentPlayer`), its phase, and of a fight on only what says whose
--   step it is (`G.combat`'s stage, attacker, draw winner and whether the foe
--   is an NPC). `G.combat` is shown to every seat already
--   (src/game/playerView.ts), so this leaks nothing. Seat ids only: an NPC's
--   id is never passed on. Never the state itself, the invite code or the seeds.
-- * Names come from `profiles`; only user ids are stored in seats.

-- The result's columns change, so the function is dropped and made again.
drop function public.list_voyages(uuid, integer);

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
  phase text,
  fight jsonb,
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
    case when r.status = 'started' then m.phase end,
    case
      when r.status = 'started'
        and jsonb_typeof(m.state -> 'G' -> 'combat') = 'object'
        and (m.state -> 'G' -> 'combat' ->> 'stage') in ('seamanship', 'chooseAction', 'fleeAttempt', 'cannons', 'resolution')
        and (m.state -> 'G' -> 'combat' ->> 'attackerId') ~ '^[0-9]$'
        and jsonb_typeof(m.state -> 'G' -> 'combat' -> 'isNPCCombat') = 'boolean'
        then jsonb_build_object(
          'stage', m.state -> 'G' -> 'combat' ->> 'stage',
          'attacker_id', m.state -> 'G' -> 'combat' ->> 'attackerId',
          -- An NPC's id is no seat: only a seat's id is passed on.
          'seamanship_winner', case
            when (m.state -> 'G' -> 'combat' ->> 'seamanshipWinner') ~ '^[0-9]$'
              then m.state -> 'G' -> 'combat' ->> 'seamanshipWinner'
          end,
          'is_npc_combat', (m.state -> 'G' -> 'combat' ->> 'isNPCCombat')::boolean
        )
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
