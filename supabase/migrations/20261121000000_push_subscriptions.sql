-- Web Push for lineup changes (#47). A signed-in user may subscribe a device; the Edge Function
-- notify-lineup (service role) reads the subscriptions of the players placed in a lineup and sends the push.
-- Who may do what: a user reads and deletes their own subscriptions; saving goes through
-- save_push_subscription() (an endpoint belongs to the account that saved it last, e.g. after another
-- account signed in on the same device). Nobody else can read the keys.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  -- the service worker scope of the site that subscribed (live site or a test stage), so a click opens that site
  scope text not null default '' check (char_length(scope) <= 300),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push: read own" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

create policy "push: delete own" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_scope text)
  returns void
  language sql security definer set search_path = ''
as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, scope)
  select (select auth.uid()), p_endpoint, p_p256dh, p_auth, coalesce(p_scope, '')
  where (select auth.uid()) is not null
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, scope = excluded.scope;
$$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- The lineup before the last change, so the push can also tell players who were taken out. Set by the
-- trigger only; null for a freshly published lineup.
alter table public.published_lineups add column previous_lineup jsonb;

create function public.published_lineups_keep_previous()
  returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.previous_lineup := old.lineup;
  else
    new.previous_lineup := null;
  end if;
  return new;
end;
$$;
create trigger published_lineups_keep_previous before insert or update on public.published_lineups
  for each row execute function public.published_lineups_keep_previous();
