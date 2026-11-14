-- "Rollen verwalten" shows the chosen player of each account instead of the login name. The claims
-- are only readable by approvers, so admins (permission role.manage) get the names through this
-- new function; list_users_with_roles stays as it is, so the live app keeps working.

create function public.list_user_players()
  returns table (user_id uuid, player_name text)
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_permission('role.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select c.user_id, c.player_name from public.player_claims c;
end;
$$;
revoke all on function public.list_user_players() from public, anon;
grant execute on function public.list_user_players() to authenticated;
