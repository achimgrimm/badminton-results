-- Length limits for the text columns a signed-in user can write, so one account can't fill the
-- database with huge values. The limits are far above what the app sends (slugs, "2026-27",
-- "heim-<opponent>", a player name).
--
-- NOT VALID: the limits apply to every new and changed row, existing rows are not scanned or
-- rejected, so the app that is live now keeps working before and after this migration.

alter table public.game_answers
  add constraint game_answers_team_slug_len check (char_length(team_slug) <= 64) not valid,
  add constraint game_answers_season_len check (char_length(season) <= 16) not valid,
  add constraint game_answers_game_key_len check (char_length(game_key) <= 100) not valid;

alter table public.player_claims
  add constraint player_claims_team_slug_len check (char_length(team_slug) <= 64) not valid,
  add constraint player_claims_season_len check (char_length(season) <= 16) not valid,
  add constraint player_claims_player_name_len check (char_length(player_name) <= 100) not valid;
