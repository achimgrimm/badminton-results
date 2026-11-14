-- Follow a team, get a push for its new results (#48). A signed-in user follows teams of a league group
-- (as shown on the Tabelle page); the Edge Function notify-results (service role) reads the subscriptions.
-- notified_results remembers which meetings were announced, so the hourly scrape never sends twice.

create table public.team_subscriptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id integer not null,
  team text not null check (char_length(team) between 1 and 200),
  -- the Tabelle page it was followed on (relative to the site), which the push opens
  path text not null default '' check (path ~ '^[a-z0-9][a-z0-9/._-]{0,150}$' or path = ''),
  created_at timestamptz not null default now(),
  primary key (user_id, group_id, team)
);

alter table public.team_subscriptions enable row level security;

create policy "team subscriptions: read own" on public.team_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "team subscriptions: add own" on public.team_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "team subscriptions: delete own" on public.team_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

create index team_subscriptions_team on public.team_subscriptions (group_id, team);

-- Service role only: RLS on, no policies.
create table public.notified_results (
  group_id integer not null,
  meeting integer not null,
  result text not null,
  notified_at timestamptz not null default now(),
  primary key (group_id, meeting, result)
);
alter table public.notified_results enable row level security;
