-- Fix for #61: open meetings have no meeting number (nuLiga assigns it with the result), so they are keyed by
-- league, home and guest. upcoming_meetings and sent_follow_starts were created in the previous migration, are
-- empty and only used by notify-follow-starts / sync-upcoming (replaced together with this), so they are recreated.

drop table public.sent_follow_starts;
drop table public.upcoming_meetings;

create table public.upcoming_meetings (
  group_id integer not null,
  home text not null,
  guest text not null,
  start timestamptz not null,
  primary key (group_id, home, guest)
);
alter table public.upcoming_meetings enable row level security;

create table public.sent_follow_starts (
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id integer not null,
  home text not null,
  guest text not null,
  start timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, group_id, home, guest, start)
);
alter table public.sent_follow_starts enable row level security;
