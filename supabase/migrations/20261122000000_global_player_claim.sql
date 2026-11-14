-- BREAKING: player_claims becomes one row per account, team_slug/season dropped (requested by the user on 2026-11-14)
--
-- "Wer bist Du?" was one pick per account and team/season. The nuLiga person is the same on every
-- team, so the pick is now global: one claim per account, one approved claim per player, and an
-- approver confirms a person once instead of once per team and season. Answers, lineups and push
-- stay per team, season and game.
--
-- Breaking for the app that is live before this one: it inserts and deletes claims by
-- (team_slug, season) and calls verified_players(team, season). Deploy this migration and the new app
-- together (pushing to main does both).

-- 1. One claim per account: keep the approved one, else the newest.
delete from public.player_claims c
using (
  select id, row_number() over (
    partition by user_id
    order by (status = 'approved') desc, created_at desc, id
  ) as rn
  from public.player_claims
) ranked
where ranked.id = c.id and ranked.rn > 1;

-- 2. One approved claim per person: keep the oldest approval, the other accounts are asked again
-- ("nicht bestätigt" on their next load). Pending claims for an approved person go as well.
delete from public.player_claims c
using (
  select id, row_number() over (
    partition by person
    order by coalesce(decided_at, created_at), id
  ) as rn
  from public.player_claims
  where status = 'approved'
) ranked
where ranked.id = c.id and ranked.rn > 1;

delete from public.player_claims p
where p.status = 'pending'
  and exists (
    select 1 from public.player_claims a where a.person = p.person and a.status = 'approved'
  );

-- 3. Team and season leave the table, with their constraints and the old indexes.
drop index if exists public.player_claims_one_approved;
alter table public.player_claims
  drop constraint if exists player_claims_user_id_team_slug_season_key,
  drop constraint if exists player_claims_team_slug_len,
  drop constraint if exists player_claims_season_len,
  drop column team_slug,
  drop column season;

-- 4. The new rules: one pick per account; only an approved claim owns a player.
alter table public.player_claims
  add constraint player_claims_user_id_key unique (user_id);
create unique index player_claims_one_approved
  on public.player_claims (person)
  where status = 'approved';

-- 5. Triggers without team and season.
create or replace function public.player_claims_decided() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
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

create or replace function public.player_claims_clear_competing() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'approved' then
    delete from public.player_claims
    where person = new.person and status = 'pending' and id <> new.id;
  end if;
  return null;
end;
$$;

-- 6. Functions. team_answers keeps its signature: the answers are still per team, season and game,
-- only the account's identity (the approved claim) no longer depends on them.
create or replace function public.team_answers(p_team text, p_season text, p_game_key text)
  returns table (person integer, state text)
  language sql stable security definer set search_path = ''
as $$
  select c.person, a.state
  from public.game_answers a
  join public.player_claims c on c.user_id = a.user_id and c.status = 'approved'
  where a.team_slug = p_team
    and a.season = p_season
    and a.game_key = p_game_key
    and a.state is not null
    and public.has_permission('answers.read_all');
$$;

-- The check mark is now global: every verified person, whatever the team.
drop function public.verified_players(text, text);
create function public.verified_players()
  returns setof integer
  language sql stable security definer set search_path = ''
as $$
  select c.person
  from public.player_claims c
  where c.status = 'approved'
    and public.has_permission('player.link');
$$;
revoke all on function public.verified_players() from public, anon;
grant execute on function public.verified_players() to authenticated;
