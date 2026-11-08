-- Users edit their own display name (policy "own profile: update"); keep it to a sane length.
-- Matches MAX_NAME_LENGTH in src/roles.ts. Names that are too long are shortened first.
update public.profiles set display_name = left(display_name, 60) where char_length(display_name) > 60;
update public.profiles set display_name = null where display_name is not null and btrim(display_name) = '';

alter table public.profiles
  add constraint profiles_display_name_length
  check (display_name is null or char_length(btrim(display_name)) between 1 and 60);
