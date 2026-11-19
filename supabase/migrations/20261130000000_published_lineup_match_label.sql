-- The readable match name ("SV Foo – SV Bar") of a published lineup, written by the app when it publishes,
-- so the push to the team lead (#57) can show the opponent as in the app instead of the lowercase game key.
-- Additive: nullable, so lineups published before this migration and the live app keep working.
-- Who may do what: unchanged (every signed-in user reads; only lineup.write holders write).
alter table public.published_lineups
  add column match_label text check (match_label is null or char_length(match_label) <= 200);
