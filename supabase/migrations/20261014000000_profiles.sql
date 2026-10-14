-- Profiles (#105): one public row per signed-in player, created by a trigger
-- when the auth user is.
--
-- Security model:
-- * Only public fields live here: id, display name, avatar URL, timestamps.
--   Nothing from auth.users beyond the id (no email, no provider or provider
--   ID, no raw metadata). The sign-in provider and its ID stay in Supabase's
--   own auth.identities, read server-side with the service role when needed.
-- * Anyone (anon included) reads every row.
-- * Rows are created only by the sign-up trigger; clients never insert or
--   delete. A signed-in player may update only their own row, and only its
--   display_name and avatar_url (column privileges); the id never changes.
-- * The table's checks hold the values sane whatever the writer: display
--   names are 1 to 32 trimmed characters with no control characters; an
--   avatar URL is null or an https:// URL of at most 2048 characters.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_check check (
      char_length(display_name) between 1 and 32
      and display_name = btrim(display_name)
      and display_name !~ '[[:cntrl:]]'
    ),
  avatar_url text
    constraint profiles_avatar_url_check check (
      avatar_url is null
      or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://[^[:space:][:cntrl:]]+$')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public player profiles: display name and avatar only. One per auth user, created by trigger.';

alter table public.profiles enable row level security;

create policy "Profiles are readable by anyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "A player updates only their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Table privileges under the policies: everyone reads; a signed-in player may
-- update only the two columns that are theirs to choose; nobody else writes.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

-- Keep updated_at honest.
create function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- A new auth user gets a profile. The display name comes from the sign-in
-- provider when it gives one (Discord, Google: #106), cleaned to pass the
-- check, else a placeholder; never from the email address. The avatar is
-- kept only when it is an acceptable https URL. User metadata can be set by
-- whoever signs up, so nothing here trusts it beyond those checks.
-- security definer: it writes a table its caller (the auth service) has no
-- grant on; search_path is pinned and every name schema-qualified.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provided_name text := btrim(regexp_replace(regexp_replace(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'user_name',
    ''
  ), '[[:space:]]+', ' ', 'g'), '[[:cntrl:]]', '', 'g'));
  provided_avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    case
      when provided_name = '' then 'Captain ' || left(replace(new.id::text, '-', ''), 6)
      else btrim(left(provided_name, 32))
    end,
    case
      when char_length(provided_avatar) <= 2048 and provided_avatar ~ '^https://[^[:space:][:cntrl:]]+$'
        then provided_avatar
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
