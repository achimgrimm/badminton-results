-- E-mail login: accounts created with an e-mail code have no Google name.
-- Fall back to the part of the e-mail address before the "@" as display name.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    nullif(split_part(new.email, '@', 1), '')
  ));
  return new;
end;
$$;
