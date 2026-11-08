-- A signed-in user's chosen player ("Wer bist Du?") per team and season, kept on the account so it
-- follows them to every device. A claim starts as 'pending' and counts for server features once an
-- admin or team lead (permission player.link) has approved it. Reject or revoke = delete the row.

create table public.player_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  team_slug text not null,
  season text not null,
  person integer not null,
  -- as sent by the app; the approval list prefers the roster name for this person
  player_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  -- one pick per account and team/season, like the local key
  unique (user_id, team_slug, season),
  -- one account per player; a pending claim holds the slot too
  unique (team_slug, season, person)
);

alter table public.player_claims enable row level security;

insert into public.permissions (name, description) values
  ('player.link', 'Approve or reject which player an account is');
insert into public.role_permissions (role, permission) values
  ('admin', 'player.link'),
  ('team_lead', 'player.link');

create policy "claims: read own or as approver" on public.player_claims
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('player.link'));

-- Anyone may claim for themselves, as pending; approvers' own claims need no second approver.
create policy "claims: insert own" on public.player_claims
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (status = 'pending' or public.has_permission('player.link'))
  );

-- Only approvers decide; users have no update policy, so nobody approves themselves.
create policy "claims: update as approver" on public.player_claims
  for update to authenticated
  using (public.has_permission('player.link'))
  with check (public.has_permission('player.link'));

create policy "claims: delete own or as approver" on public.player_claims
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('player.link'));

-- The name shown for an account is the chosen player; the profile name stays what Google gave at
-- signup and is not editable, so approvers always see the real account name.
drop policy "own profile: update" on public.profiles;

-- Approvers see the claimer's display name (never the email).
create policy "profiles: read as approver" on public.profiles
  for select to authenticated using (public.has_permission('player.link'));

-- Records who approved and when; an update may only change the status.
create function public.player_claims_decided() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.team_slug := old.team_slug;
    new.season := old.season;
    new.person := old.person;
    new.player_name := old.player_name;
    new.created_at := old.created_at;
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    new.decided_by := (select auth.uid());
    new.decided_at := now();
  elsif new.status = 'pending' then
    new.decided_by := null;
    new.decided_at := null;
  end if;
  return new;
end;
$$;
create trigger player_claims_decided before insert or update on public.player_claims
  for each row execute function public.player_claims_decided();
