-- Role "player" and the "not an active player" choice (#52). Additive only.
--
-- * The role "player" is held by every account whose nuLiga player link (player_claims) is approved.
--   It is kept in line by a trigger, so it follows approvals, replacements and rejections. Nobody
--   assigns it by hand (set_user_role still only knows team_lead and admin) and it grants no permission.
-- * profiles.not_a_player remembers that an account is a regular member who doesn't play, so the app
--   stops asking "Wer bist Du?". Clients can't update profiles, so the account sets it with
--   set_not_a_player(); a new claim resets it.

insert into public.roles (name, description)
values ('player', 'Linked to a nuLiga player');

alter table public.profiles add column not_a_player boolean not null default false;

create function public.player_claims_sync_role() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      delete from public.user_roles where user_id = old.user_id and role = 'player';
    end if;
    return old;
  end if;
  if new.status = 'approved' then
    insert into public.user_roles (user_id, role) values (new.user_id, 'player') on conflict do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'approved' then
    delete from public.user_roles where user_id = new.user_id and role = 'player';
  end if;
  if tg_op = 'INSERT' then
    update public.profiles set not_a_player = false where id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.player_claims_sync_role() from public, anon, authenticated;

create trigger player_claims_sync_role after insert or update of status or delete on public.player_claims
  for each row execute function public.player_claims_sync_role();

-- The signed-in account says that it doesn't play (true) or takes that back (false). Saying it drops
-- the account's own player claim, and with it the player role.
create function public.set_not_a_player(flag boolean) returns void
  language plpgsql security definer set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in'; end if;
  if flag then
    delete from public.player_claims where user_id = uid;
  end if;
  update public.profiles set not_a_player = flag where id = uid;
end;
$$;
revoke all on function public.set_not_a_player(boolean) from public, anon;
grant execute on function public.set_not_a_player(boolean) to authenticated;

-- Accounts that are already linked to a player get the role.
insert into public.user_roles (user_id, role)
select user_id, 'player' from public.player_claims where status = 'approved'
on conflict do nothing;
