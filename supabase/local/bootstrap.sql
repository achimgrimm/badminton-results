-- The small part of Supabase that the migrations rely on, for a plain local Postgres:
-- the anon and authenticated roles, auth.users and auth.uid(). Safe to run again.

set client_min_messages = warning;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);

-- Like Supabase: the signed-in user is read from the request's JWT claims.
-- Test as a user:  set role authenticated; set request.jwt.claim.sub = '<uuid>';
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Supabase's defaults: API roles may use what is created in public (row-level security guards it).
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
