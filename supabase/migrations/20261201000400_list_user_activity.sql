-- "Rollen verwalten" shows per account how it is used (#59): logged-in devices, last login and devices
-- with notifications on. Sessions and sign-in times live in auth.*, which clients can't read, so admins
-- (permission role.manage) get them through this new function; nobody else may call it.

create function public.list_user_activity()
  returns table (user_id uuid, devices integer, last_sign_in_at timestamptz, push_devices integer)
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_permission('role.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select u.id,
      (select count(*)::integer from auth.sessions s
        where s.user_id = u.id and (s.not_after is null or s.not_after > now())),
      u.last_sign_in_at,
      (select count(*)::integer from public.push_subscriptions p where p.user_id = u.id)
    from auth.users u;
end;
$$;
revoke all on function public.list_user_activity() from public, anon;
grant execute on function public.list_user_activity() to authenticated;
