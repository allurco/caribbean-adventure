-- A player's voyages, fourth cut: whose step a fight is on now reads who
-- fires the parting shot. A ship caught fleeing does not fire it: the
-- pursuer does, and applies its damage (`combatActor` in
-- src/game/combatActor.ts). So a fight in `list_voyages` also carries
-- `defender_id` (a seat's id only, never an NPC's, as `seamanship_winner`)
-- and `flee_outcome` ('escaped', 'caught' or null). /api works out
-- `yourTurn` from them (server/voyages.ts), and the in-memory store mirrors
-- it (server/memoryOnlineStore.ts).
--
-- Security model, as in 20261018000000_voyages_fight.sql. Both are as public
-- as `G.combat` already is to every seat (src/game/playerView.ts).
--
-- The result's columns are unchanged (`fight` stays jsonb), so the function
-- is replaced in place; the revoke and the grant are stated again below.

-- Up to `p_limit` (at most 50) of `p_user`'s rooms, the most recently changed
-- first: a match's last move, or the room's creation before it started.
create or replace function public.list_voyages(p_user uuid, p_limit integer)
returns table (
  room_id uuid,
  status text,
  seat_count integer,
  map_size text,
  match_id uuid,
  current_seat integer,
  phase text,
  fight jsonb,
  choosing jsonb,
  updated_at timestamptz,
  seats jsonb
)
language sql
stable
set search_path = ''
as $$
  -- A seat's player id is one digit, `^[0-9]$`: the same check as `isSeatId`
  -- in src/game/seats.ts, which /api and the in-memory store use.
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
          'defender_id', case
            when (m.state -> 'G' -> 'combat' ->> 'defenderId') ~ '^[0-9]$'
              then m.state -> 'G' -> 'combat' ->> 'defenderId'
          end,
          'seamanship_winner', case
            when (m.state -> 'G' -> 'combat' ->> 'seamanshipWinner') ~ '^[0-9]$'
              then m.state -> 'G' -> 'combat' ->> 'seamanshipWinner'
          end,
          'is_npc_combat', (m.state -> 'G' -> 'combat' ->> 'isNPCCombat')::boolean,
          'flee_outcome', case
            when (m.state -> 'G' -> 'combat' ->> 'fleeOutcome') in ('escaped', 'caught')
              then m.state -> 'G' -> 'combat' ->> 'fleeOutcome'
          end
        )
    end,
    -- In the draft, the seats yet to pick: a seat's ship with no captain or no class.
    case
      when r.status = 'started' and m.phase = 'draft' and jsonb_typeof(m.state -> 'G' -> 'ships') = 'object'
        then (
          select coalesce(jsonb_agg(ship.key::integer order by ship.key::integer), '[]'::jsonb)
          from jsonb_each(m.state -> 'G' -> 'ships') as ship
          where ship.key ~ '^[0-9]$'
            and (jsonb_typeof(ship.value -> 'captain') is distinct from 'object'
              or jsonb_typeof(ship.value -> 'shipClass') is distinct from 'string')
        )
      else '[]'::jsonb
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
