-- Team leads and admins (permission answers.read_all) see which players of a team answered what for a
-- game ("Ich spiele": yes / maybe / no), so the lineup planning can show who is available.
-- game_answers stays readable by its owner only; this function hands out just the answers of accounts
-- with an approved player claim for that team and season, as (nuLiga person, state), and only to
-- holders of the permission. Cleared answers (state null) are not returned. No policy is widened.

insert into public.permissions (name, description) values
  ('answers.read_all', 'See the match answers (yes / maybe / no) of the team''s players');
insert into public.role_permissions (role, permission) values
  ('admin', 'answers.read_all'),
  ('team_lead', 'answers.read_all');

create function public.team_answers(p_team text, p_season text, p_game_key text)
  returns table (person integer, state text)
  language sql stable security definer set search_path = ''
as $$
  select c.person, a.state
  from public.game_answers a
  join public.player_claims c
    on c.user_id = a.user_id and c.team_slug = a.team_slug and c.season = a.season and c.status = 'approved'
  where a.team_slug = p_team
    and a.season = p_season
    and a.game_key = p_game_key
    and a.state is not null
    and public.has_permission('answers.read_all');
$$;
revoke all on function public.team_answers(text, text, text) from public, anon;
grant execute on function public.team_answers(text, text, text) to authenticated;
