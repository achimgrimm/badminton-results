-- Reminder push before a match marked "Ich spiele" (#21). Additive only.
-- reminder_settings: an account can turn the reminders off; no row means on. Own rows only.
-- sent_reminders: one row per user and kick-off, so the hourly run never reminds twice (service role only).

create table public.reminder_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default true
);

alter table public.reminder_settings enable row level security;

create policy "reminders: read own" on public.reminder_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "reminders: add own" on public.reminder_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reminders: change own" on public.reminder_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reminders: delete own" on public.reminder_settings
  for delete to authenticated using (user_id = (select auth.uid()));

-- Service role only: RLS on, no policies.
create table public.sent_reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  team_slug text not null,
  season text not null,
  game_key text not null,
  start timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, team_slug, season, game_key, start)
);
alter table public.sent_reminders enable row level security;
