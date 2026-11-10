-- A signed-in user's answer per game ("Ich spiele": yes / maybe / no), kept on the account so it
-- follows them to every device. The device keeps a copy in localStorage and syncs both ways, per
-- game, newest answer wins. Only the owner reads or writes a row; nobody else sees the answers.
--
-- state is null for a cleared answer (a tombstone), so that clearing on one device reaches the others.
-- updated_at is set by the client when the answer was given (it may be offline for a while), and the
-- trigger below ignores a write that is older than the stored one, so a late upload can't undo a newer answer.

create table public.game_answers (
  user_id uuid not null references auth.users (id) on delete cascade,
  team_slug text not null,
  season text not null,
  -- the preview name of the game, e.g. 'heim-<opponent>' or 'auswaerts-<opponent>'
  game_key text not null,
  state text check (state in ('yes', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (user_id, team_slug, season, game_key)
);

alter table public.game_answers enable row level security;

create policy "answers: read own" on public.game_answers
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "answers: insert own" on public.game_answers
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "answers: update own" on public.game_answers
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "answers: delete own" on public.game_answers
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Last write wins per game: an update older than the stored row is skipped without an error, so a
-- batch upsert of queued offline changes still applies its newer rows.
create function public.game_answers_keep_newer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

create trigger game_answers_keep_newer
  before update on public.game_answers
  for each row execute function public.game_answers_keep_newer();
