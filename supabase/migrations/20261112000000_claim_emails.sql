-- Approvers (permission player.link) see the email address of an account whose claim waits for a
-- decision, so they can tell who is behind a name. Emails live in auth.users, which no client can
-- read, so this function hands out only those of accounts with a pending claim, and only to approvers.

create function public.pending_claim_emails() returns table (user_id uuid, email text)
  language sql stable security definer set search_path = ''
as $$
  select u.id, u.email::text
  from public.player_claims c
  join auth.users u on u.id = c.user_id
  where c.status = 'pending' and public.has_permission('player.link');
$$;
revoke all on function public.pending_claim_emails() from public, anon;
grant execute on function public.pending_claim_emails() to authenticated;
