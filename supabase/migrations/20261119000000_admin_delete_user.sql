-- Admins (permission role.manage) delete another person's account from the roles dialog, like
-- delete_account() does for oneself: the profile, roles, claims and answers go by cascade.
-- Guards: not your own account (use "Konto löschen" in the menu) and never the last admin.

create function public.admin_delete_user(target uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_permission('role.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if target = (select auth.uid()) then
    raise exception 'use delete_account for your own account';
  end if;
  if exists (select 1 from public.user_roles where user_id = target and role = 'admin')
     and (select count(*) from public.user_roles where role = 'admin' and user_id <> target) = 0 then
    raise exception 'the last admin cannot be deleted';
  end if;
  delete from auth.users where id = target;
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
