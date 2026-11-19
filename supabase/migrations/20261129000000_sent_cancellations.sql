-- Push to the team lead when a player cancels after the lineup is published (#57). Additive only.
-- sent_cancellations: one row per user, game and answer time, so a sync retry never notifies twice (service role only).
create table public.sent_cancellations (
  user_id uuid not null references auth.users (id) on delete cascade,
  team_slug text not null,
  season text not null,
  game_key text not null,
  answered_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, team_slug, season, game_key, answered_at)
);
alter table public.sent_cancellations enable row level security;
