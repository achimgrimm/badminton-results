-- Admins (permission role.manage) see all accounts with their roles and grant or revoke the roles
-- admin and team_lead from the app. No client may write user_roles directly; both functions are
-- security definer and check the permission themselves. Emails live in auth.users, which no client
-- can read, so list_users_with_roles hands them out, and only to those who may manage roles.

create function public.list_users_with_roles()
  returns table (user_id uuid, display_name text, email text, roles text[])
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_permission('role.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select u.id, p.display_name, u.email::text,
           coalesce(array_agg(ur.role order by ur.role) filter (where ur.role is not null), '{}')
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_roles ur on ur.user_id = u.id
    group by u.id, p.display_name, u.email;
end;
$$;
revoke all on function public.list_users_with_roles() from public, anon;
grant execute on function public.list_users_with_roles() to authenticated;

-- Grant (on_ = true) or revoke (on_ = false) admin or team_lead. member stays implicit.
-- Guards: nobody removes their own admin role, and the last admin cannot be removed.
create function public.set_user_role(target uuid, role_name text, on_ boolean) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_permission('role.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if role_name not in ('admin', 'team_lead') then
    raise exception 'role not assignable';
  end if;
  if on_ then
    insert into public.user_roles (user_id, role) values (target, role_name)
    on conflict do nothing;
  else
    if role_name = 'admin' and target = (select auth.uid()) then
      raise exception 'you cannot remove your own admin role';
    end if;
    if role_name = 'admin'
       and (select count(*) from public.user_roles where role = 'admin' and user_id <> target) = 0 then
      raise exception 'the last admin cannot be removed';
    end if;
    delete from public.user_roles where user_id = target and role = role_name;
  end if;
end;
$$;
revoke all on function public.set_user_role(uuid, text, boolean) from public, anon;
grant execute on function public.set_user_role(uuid, text, boolean) to authenticated;
