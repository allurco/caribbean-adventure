-- A match's realtime channel (#114, PRD #104 Realtime channels; ADR 0008).
--
-- Each match has one private Supabase Realtime channel, `match:{id}`, with
-- Realtime Authorization: Realtime checks a client's token against the
-- row-level security policies on `realtime.messages` when it joins a private
-- channel (https://supabase.com/docs/guides/realtime/authorization).
--
-- Security model:
-- * Only the match's seated players may join its channel: they receive its
--   broadcasts and its presence (select).
-- * They may send presence (insert, extension 'presence'), and nothing else:
--   no client may broadcast, so no client can send the 'changed' signal or
--   anything dressed up as one.
-- * The 'changed' signal is sent by /api alone, through Realtime's REST
--   broadcast endpoint with the service role, which bypasses these policies.
--   It carries the state's version (`{ "v": <state id> }`) and never game
--   state: each seat then fetches its own view through /api.
-- * Presence is keyed by seat, with an online flag and nothing more.
-- * Every other topic stays closed: these policies grant nothing outside
--   `match:{uuid}`, and anon gets nothing.
--
-- Enforced only for private channels: the client joins with
-- `config: { private: true }`, and the server broadcasts with
-- `private: true`. Turn off "Allow public access" in the project's Realtime
-- settings so no client can use a public channel at all.

-- Whether the caller holds a seat in the match whose channel is `p_topic`.
-- security definer, so the policies can read seats and matches whatever the
-- caller's own grants; it answers only for auth.uid(), and only for a topic
-- of the form `match:<uuid>` (checked before the cast).
create function public.is_match_channel_member(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_topic ~ '^match:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
      select 1
      from public.matches m
      join public.seats s on s.room_id = m.room_id
      where m.id = substring(p_topic from 7)::uuid
        and s.user_id = (select auth.uid())
    )
    else false
  end;
$$;

revoke execute on function public.is_match_channel_member(text) from public, anon;
grant execute on function public.is_match_channel_member(text) to authenticated;

create policy "Seated players receive their match channel's signal and presence"
  on realtime.messages for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select public.is_match_channel_member((select realtime.topic())))
  );

create policy "Seated players share presence on their match channel"
  on realtime.messages for insert
  to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (select public.is_match_channel_member((select realtime.topic())))
  );
