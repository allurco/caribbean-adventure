-- Discord and Google sign-in (#106): the provider's ID lands on the
-- player's profile, and the provider's avatar (and name, while the profile
-- still has the placeholder) fills it in.
--
-- How a profile is reached: Supabase Auth keeps one auth.users row per
-- player and one auth.identities row per way they sign in (email, discord,
-- google). It links a new Discord or Google identity to the existing user
-- whose email matches, when the provider vouches for that email, so a
-- returning player reaches the same user, and so the same profile, whichever
-- way they signed in first. A provider email that is unverified, missing or
-- different makes a separate user (docs/deploy.md, "Same captain").
--
-- Security model, as for public.profiles (#105):
-- * profile_identities holds which Discord and Google accounts sign in to a
--   profile. A player reads only their own rows; nobody else (anon included)
--   reads any, so the public profile stays a name and an avatar. The
--   provider IDs are not secret, but they would tie a captain to their
--   accounts elsewhere. (This keeps them private where PRD #104 said they
--   would be public: the maintainer's decision for #106.)
-- * The avatar stays public, and a Discord avatar URL contains the player's
--   Discord user ID (https://cdn.discordapp.com/avatars/<user id>/<hash>.png).
--   So anyone who reads a profile with a Discord avatar can read that ID from
--   it; only the link to the provider in profile_identities is private.
--   Google's picture URLs are opaque tokens, not the account ID.
-- * Clients never write it: rows come only from the trigger on
--   auth.identities below (or the service role, which bypasses RLS).
-- * Players can no longer set profiles.avatar_url themselves (the update
--   grant on that column is revoked below): only the sign-in triggers write
--   it, so an avatar is always one a provider gave. The display name stays
--   theirs to choose.
-- * Triggers on auth.identities are among those Supabase allows on the auth
--   schema (supabase discussion 34270), like the one on auth.users (#105).
-- * The trigger never fails a sign-in: a value that does not pass the
--   checks is skipped, and any other error is only logged.

-- A provider's account ID as profile_identities stores it: Discord's are
-- numeric snowflakes, Google's numeric too; the class leaves room for others.
create function public.is_provider_id(id text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select id ~ '^[A-Za-z0-9_.@-]{1,255}$';
$$;

-- The name handle_new_user (#105) gives a profile when the provider gives
-- none; a profile that still has it has never had a name chosen.
create function public.placeholder_display_name(profile_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Captain ' || left(replace(profile_id::text, '-', ''), 6);
$$;

create table public.profile_identities (
  provider text not null
    constraint profile_identities_provider_check check (provider in ('discord', 'google')),
  provider_id text not null
    constraint profile_identities_provider_id_check check (public.is_provider_id(provider_id)),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (provider, provider_id)
);

create index profile_identities_profile_id_idx on public.profile_identities (profile_id);

comment on table public.profile_identities is 'The Discord and Google accounts a player signs in with (#106). Readable by its owner only; written by the auth.identities trigger.';

alter table public.profile_identities enable row level security;

create policy "A player reads only their own sign-in providers"
  on public.profile_identities for select
  to authenticated
  using ((select auth.uid()) = profile_id);

revoke all on table public.profile_identities from anon, authenticated;
grant select on table public.profile_identities to authenticated;

-- The avatar a provider gives, when it passes the profiles table's check;
-- else null. Discord and Google both send avatar_url; Google also picture.
create function public.provider_avatar_url(data jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when char_length(url) <= 2048 and url ~ '^https://[^[:space:][:cntrl:]]+$' then url
  end
  from (select coalesce(data ->> 'avatar_url', data ->> 'picture') as url) as provided;
$$;

-- The name a provider gives, cleaned as handle_new_user cleans it (#105) to
-- pass the profiles table's check; null when there is none.
create function public.provider_display_name(data jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(left(cleaned, 32)), '')
  from (
    select btrim(regexp_replace(regexp_replace(coalesce(
      data ->> 'full_name',
      data ->> 'name',
      data ->> 'user_name',
      ''
    ), '[[:space:]]+', ' ', 'g'), '[[:cntrl:]]', '', 'g')) as cleaned
  ) as provided;
$$;

-- A Discord or Google identity was added to a user, or refreshed on a later
-- sign-in: record its ID on the profile, and fill the avatar when the
-- profile has none or still shows this provider's previous one (Discord's
-- avatar URLs change with the picture), and the name while it is still the
-- placeholder handle_new_user gave. A name or avatar the player chose stays.
-- security definer: it writes tables its caller (the auth service) has no
-- grant on; search_path is pinned and every name schema-qualified.
create function public.handle_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_avatar text;
  old_avatar text;
  new_name text;
begin
  if new.provider not in ('discord', 'google') then
    return new;
  end if;
  begin
    if not exists (select 1 from public.profiles where id = new.user_id) then
      return new;
    end if;

    if public.is_provider_id(new.provider_id) then
      insert into public.profile_identities (provider, provider_id, profile_id)
      values (new.provider, new.provider_id, new.user_id)
      on conflict (provider, provider_id) do update set profile_id = excluded.profile_id
        where public.profile_identities.profile_id is distinct from excluded.profile_id;
    end if;

    new_avatar := public.provider_avatar_url(new.identity_data);
    if tg_op = 'UPDATE' then
      old_avatar := public.provider_avatar_url(old.identity_data);
    end if;
    if new_avatar is not null then
      update public.profiles
        set avatar_url = new_avatar
        where id = new.user_id
          and (avatar_url is null or avatar_url = old_avatar)
          and avatar_url is distinct from new_avatar;
    end if;

    new_name := public.provider_display_name(new.identity_data);
    if new_name is not null then
      update public.profiles
        set display_name = new_name
        where id = new.user_id
          and display_name = public.placeholder_display_name(new.user_id);
    end if;
  exception when others then
    raise warning 'handle_identity_change: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;

-- An identity unlinked from a user no longer signs in to the profile.
create function public.handle_identity_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profile_identities
    where provider = old.provider and provider_id = old.provider_id and profile_id = old.user_id;
  return old;
end;
$$;

revoke execute on function public.is_provider_id(text) from public, anon, authenticated;
-- The table's check calls it, so whoever may write the table needs it.
grant execute on function public.is_provider_id(text) to service_role;
revoke execute on function public.placeholder_display_name(uuid) from public, anon, authenticated;
revoke execute on function public.provider_avatar_url(jsonb) from public, anon, authenticated;
revoke execute on function public.provider_display_name(jsonb) from public, anon, authenticated;
revoke execute on function public.handle_identity_change() from public, anon, authenticated;
revoke execute on function public.handle_identity_removed() from public, anon, authenticated;

-- handle_new_user is not redefined here: #108's version
-- (20261020000000_delete_account.sql), which runs before this one, already
-- takes the sign-up's avatar only from a Discord or Google sign-up (anyone can
-- sign up through Auth's /otp with any `data`, so an email sign-up's
-- avatar_url would be the player's own choice) and treats a provider's name
-- equal to the reserved "Deleted player" as no name.

-- The avatar is a provider's, never the player's choice: only the security
-- definer triggers (handle_new_user, handle_identity_change) write it.
revoke update (avatar_url) on table public.profiles from authenticated;

-- An avatar an email sign-up chose before this migration (through /otp's
-- metadata, or the update grant revoked above) is dropped; one a Discord or
-- Google identity gave stays.
update public.profiles as p
  set avatar_url = null
  where p.avatar_url is not null
    and not exists (
      select 1 from auth.identities as i
      where i.user_id = p.id and i.provider in ('discord', 'google')
    );

create trigger on_auth_identity_saved
  after insert or update on auth.identities
  for each row execute function public.handle_identity_change();

create trigger on_auth_identity_removed
  after delete on auth.identities
  for each row execute function public.handle_identity_removed();

-- Identities made before this migration (none in production when it ships,
-- but a local stack may have some).
insert into public.profile_identities (provider, provider_id, profile_id, linked_at)
select i.provider, i.provider_id, i.user_id, coalesce(i.created_at, now())
from auth.identities as i
join public.profiles as p on p.id = i.user_id
where i.provider in ('discord', 'google')
  and public.is_provider_id(i.provider_id)
on conflict do nothing;

update public.profiles as p
  set avatar_url = public.provider_avatar_url(i.identity_data)
  from auth.identities as i
  where i.user_id = p.id
    and i.provider in ('discord', 'google')
    and p.avatar_url is null
    and public.provider_avatar_url(i.identity_data) is not null;
