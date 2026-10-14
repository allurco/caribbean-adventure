-- Profiles (#105): one public row per signed-in player, created by a trigger
-- when the auth user is. Readable by anyone; only its owner may change it,
-- and only its display name and avatar. The sign-in provider and its ID are
-- written by the trigger alone.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 1 and 32 and display_name = btrim(display_name)),
  avatar_url text,
  provider text,
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public player profiles: display name, avatar, sign-in provider. One per auth user.';

alter table public.profiles enable row level security;

create policy "Profiles are readable by anyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "A player inserts only their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "A player updates only their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Table privileges on top of the policies: nobody signed out writes, and a
-- signed-in player may set only the columns that are theirs to choose.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant insert (id, display_name, avatar_url) on table public.profiles to authenticated;
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
-- provider when it gives one (Discord, Google: #106), else a placeholder; never
-- from the email address, since profiles are public.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provided_name text := btrim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'user_name',
    ''
  ));
begin
  insert into public.profiles (id, display_name, avatar_url, provider, provider_id)
  values (
    new.id,
    case
      when provided_name = '' then 'Captain ' || left(replace(new.id::text, '-', ''), 6)
      else btrim(left(provided_name, 32))
    end,
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
    coalesce(new.raw_user_meta_data ->> 'provider_id', new.raw_user_meta_data ->> 'sub')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
