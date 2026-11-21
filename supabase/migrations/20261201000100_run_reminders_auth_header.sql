-- Fix for #62: the Edge Function gateway rejected run_reminders() with 401 (missing authorization header).
-- Send the public anon (publishable) key like the site update does; the real check is x-notify-secret.
-- Same signature and return type as before, so nothing breaks.

create or replace function public.run_reminders()
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
    url := 'https://jfsjjkfrhkaothradjiy.supabase.co/functions/v1/notify-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', anon,
      'Authorization', 'Bearer ' || anon, 'x-notify-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
