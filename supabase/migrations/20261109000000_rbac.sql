-- Role-based access control: users hold roles, roles hold permissions. Replaces the team-specific
-- team_leads table. Roles are global (not per team) and assigned by an admin in SQL; no policy lets
-- a client write any of these tables, so nobody can grant themselves a role.
--
-- Policies of later tables use the check, e.g.:
--   using (public.has_permission('lineup.write'))
-- and a new feature adds its permissions and role_permissions rows in its own migration.
--
-- First admin (run once in the SQL editor, with your own address):
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = '<your email>';

create table public.roles (
  name text primary key,
  description text not null
);

create table public.permissions (
  name text primary key,
  description text not null
);

create table public.role_permissions (
  role text not null references public.roles (name) on update cascade on delete cascade,
  permission text not null references public.permissions (name) on update cascade on delete cascade,
  primary key (role, permission)
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null references public.roles (name) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

-- Reference data is readable by signed-in users; only migrations and admins in SQL change it.
create policy "roles: read" on public.roles for select to authenticated using (true);
create policy "permissions: read" on public.permissions for select to authenticated using (true);
create policy "role permissions: read" on public.role_permissions for select to authenticated using (true);
create policy "own roles: read" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));

insert into public.roles (name, description) values
  ('admin', 'Manages roles and everything else'),
  ('team_lead', 'Edits lineups and lineup templates'),
  ('member', 'Signed in, no extra rights');

insert into public.permissions (name, description) values
  ('role.manage', 'Assign and remove roles'),
  ('lineup.write', 'Create and change lineups (#22)'),
  ('template.write', 'Save and apply default lineups (#23)');

insert into public.role_permissions (role, permission) values
  ('admin', 'role.manage'),
  ('admin', 'lineup.write'),
  ('admin', 'template.write'),
  ('team_lead', 'lineup.write'),
  ('team_lead', 'template.write');

-- Does the signed-in user hold a role that has this permission?
create function public.has_permission(perm text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = (select auth.uid()) and rp.permission = perm
  );
$$;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

-- The signed-in user's permissions, so the app can show or hide controls.
create function public.my_permissions() returns setof text
  language sql stable security definer set search_path = ''
as $$
  select distinct rp.permission
  from public.user_roles ur
  join public.role_permissions rp on rp.role = ur.role
  where ur.user_id = (select auth.uid());
$$;
revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

-- Every new account starts as a member.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  insert into public.user_roles (user_id, role) values (new.id, 'member');
  return new;
end;
$$;

-- Accounts that exist already become members too.
insert into public.user_roles (user_id, role)
select id, 'member' from auth.users
on conflict do nothing;

-- The team-specific table is replaced by the roles above (it never held a row).
drop function public.is_team_lead(text);
drop table public.team_leads;
