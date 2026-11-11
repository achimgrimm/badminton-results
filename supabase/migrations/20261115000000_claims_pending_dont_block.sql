-- Only an approved claim owns a player. Until now `unique (team_slug, season, person)` let any
-- account hold a player's slot with a mere pending claim, locking out the real person (issue #36).
-- From now on pending claims for the same player may coexist, and the approver picks one; approving
-- a claim deletes the other pending ones for that player (they see "nicht bestätigt" on their next
-- load). A second approved claim for a player is still refused (23505), so "taken" keeps working.
--
-- Not breaking for the app that is live now: the unique constraint is only loosened, so inserts
-- that used to fail with 23505 succeed as pending; nothing the app does can start failing.
-- `unique (user_id, team_slug, season)` stays: one pick per account and team/season.

-- The strict rule first, then the old one goes, so a player is never unprotected.
create unique index player_claims_one_approved
  on public.player_claims (team_slug, season, person)
  where status = 'approved';

alter table public.player_claims
  drop constraint if exists player_claims_team_slug_season_person_key;

-- When a claim is or becomes approved, the competing pending claims for that player are rejected.
create function public.player_claims_clear_competing() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'approved' then
    delete from public.player_claims
    where team_slug = new.team_slug and season = new.season and person = new.person
      and status = 'pending' and id <> new.id;
  end if;
  return null;
end;
$$;
revoke all on function public.player_claims_clear_competing() from public, anon, authenticated;

create trigger player_claims_clear_competing
  after insert or update of status on public.player_claims
  for each row execute function public.player_claims_clear_competing();
