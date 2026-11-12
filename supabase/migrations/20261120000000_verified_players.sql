-- Team leads and admins (permission player.link) see which players of a team are verified, i.e. have an
-- approved player claim, so the app can show a check mark after their names.
-- player_claims stays readable by its owner (and approvers' pending list); this function hands out just
-- the nuLiga person ids of approved claims for one team and season, and only to holders of the
-- permission. No policy is widened.

create function public.verified_players(p_team text, p_season text)
  returns setof integer
  language sql stable security definer set search_path = ''
as $$
  select c.person
  from public.player_claims c
  where c.team_slug = p_team
    and c.season = p_season
    and c.status = 'approved'
    and public.has_permission('player.link');
$$;
revoke all on function public.verified_players(text, text) from public, anon;
grant execute on function public.verified_players(text, text) to authenticated;
