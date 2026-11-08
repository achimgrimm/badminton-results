-- Profiles and approved team leads. Row-level security is on for every table; the browser
-- only uses the public key, so these policies are the whole access control.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Who may change a team's shared data (lineups etc.). Rows are added by an admin in SQL;
-- there is no policy that lets a client write here, so nobody can approve themselves.
create table public.team_leads (
  user_id uuid not null references auth.users (id) on delete cascade,
  team_slug text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, team_slug)
);

alter table public.profiles enable row level security;
alter table public.team_leads enable row level security;

create policy "own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own team lead rows: read" on public.team_leads
  for select to authenticated using (user_id = (select auth.uid()));

-- For policies on later tables: is the signed-in user an approved lead of this team?
create function public.is_team_lead(team text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_leads
    where user_id = (select auth.uid()) and team_slug = team and approved
  );
$$;
revoke all on function public.is_team_lead(text) from public, anon;
grant execute on function public.is_team_lead(text) to authenticated;

-- A profile is created with every new account.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Account deletion: removes the user; profile and team lead rows cascade.
create function public.delete_account() returns void
  language sql security definer set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
