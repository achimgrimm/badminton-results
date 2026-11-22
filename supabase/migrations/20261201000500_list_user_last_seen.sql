-- "Rollen verwalten" also shows when an account's app was last seen (#69): the latest token refresh of
-- its valid sessions. The app refreshes its login while it is open; a signed-in session that has not
-- refreshed for long belongs to an app that is not used (or can't be reached). A new function, so
-- list_user_activity() keeps its shape for the live app. Only admins (role.manage) may call it.

create function public.list_user_last_seen()
  returns table (user_id uuid, last_seen_at timestamptz)
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_permission('role.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select s.user_id, max(coalesce(s.refreshed_at, s.created_at))
    from auth.sessions s
    where s.not_after is null or s.not_after > now()
    group by s.user_id;
end;
$$;
revoke all on function public.list_user_last_seen() from public, anon;
grant execute on function public.list_user_last_seen() to authenticated;
