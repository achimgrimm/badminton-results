-- Push 24 hours before a match of a followed team (#61). Additive only.
-- upcoming_meetings: all open meetings of the followed leagues for the next days, synced by the site update
--   (Edge Function sync-upcoming). Service role only (RLS on, no policies).
-- sent_follow_starts: one row per user, meeting and kick-off, so nobody is notified twice (service role only).
-- run_follow_starts(): called by pg_cron every 15 minutes, posts to the Edge Function notify-follow-starts.
--   Uses the Vault secret 'notify_secret' (see run_reminders, #62).

create table public.upcoming_meetings (
  group_id integer not null,
  meeting integer not null,
  home text not null,
  guest text not null,
  start timestamptz not null,
  primary key (group_id, meeting)
);
alter table public.upcoming_meetings enable row level security;

create table public.sent_follow_starts (
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id integer not null,
  meeting integer not null,
  start timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, group_id, meeting, start)
);
alter table public.sent_follow_starts enable row level security;

create or replace function public.run_follow_starts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  anon text := 'sb_publishable_C1miwWvIufN93GrVHZPPwA_KMteGNua';
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://jfsjjkfrhkaothradjiy.supabase.co/functions/v1/notify-follow-starts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', anon,
      'Authorization', 'Bearer ' || anon, 'x-notify-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.run_follow_starts() from public, anon, authenticated;

select cron.schedule('follow-starts', '*/15 * * * *', 'select public.run_follow_starts()');
