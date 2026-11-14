-- Push to approvers when a new account picks its player for the first time (#49).
-- Additive only. The Edge Function notify-new-user (service role) inserts one row per account the first time it
-- notifies, so later picks or sign-ins of the same account never notify again.
-- Who may do what: nobody on the client (RLS on, no policies); only the service role reads and writes.

create table public.admin_signin_notices (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_signin_notices enable row level security;
