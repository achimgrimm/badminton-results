-- The lineup a team lead published for a game, so players can see it (read only). Planning stays a
-- private draft on the team lead's device until "Aufstellung veröffentlichen"; withdrawing deletes the row.
-- Who may do what: every signed-in user reads; only holders of lineup.write (team_lead, admin) write.

create table public.published_lineups (
  team_slug text not null,
  season text not null,
  -- the preview name of the game, e.g. 'heim-<opponent>' or 'auswaerts-<opponent>'
  game_key text not null,
  -- { "1.HD": ["123", "456"], "1.HE": ["789"], "DE": [null] }: nuLiga person ids per discipline and slot
  lineup jsonb not null check (jsonb_typeof(lineup) = 'object' and pg_column_size(lineup) < 8192),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  primary key (team_slug, season, game_key)
);

alter table public.published_lineups enable row level security;

create policy "lineups: read when signed in" on public.published_lineups
  for select to authenticated using (true);

create policy "lineups: insert as lineup writer" on public.published_lineups
  for insert to authenticated with check (public.has_permission('lineup.write'));

create policy "lineups: update as lineup writer" on public.published_lineups
  for update to authenticated
  using (public.has_permission('lineup.write'))
  with check (public.has_permission('lineup.write'));

create policy "lineups: delete as lineup writer" on public.published_lineups
  for delete to authenticated using (public.has_permission('lineup.write'));
