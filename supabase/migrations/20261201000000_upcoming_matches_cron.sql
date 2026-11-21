-- Match reminders on a reliable schedule (#62). Additive only.
-- upcoming_matches: own matches of the next days, synced by the site update (Edge Function sync-upcoming).
--   Service role only (RLS on, no policies).
-- run_reminders(): called by pg_cron every 15 minutes, posts to the Edge Function notify-reminders, which
--   reminds the players of matches starting within 24 hours. Needs the Vault secret 'notify_secret' (the same
--   value as NOTIFY_SECRET), created once by hand:  select vault.create_secret('<NOTIFY_SECRET>', 'notify_secret');
--   Without it the job does nothing.

create table public.upcoming_matches (
  team_slug text not null,
  season text not null,
  game_key text not null,
  home text not null,
  guest text not null,
  start timestamptz not null,
  primary key (team_slug, season, game_key)
);
alter table public.upcoming_matches enable row level security;

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.run_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://jfsjjkfrhkaothradjiy.supabase.co/functions/v1/notify-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.run_reminders() from public, anon, authenticated;

select cron.schedule('match-reminders', '*/15 * * * *', 'select public.run_reminders()');
