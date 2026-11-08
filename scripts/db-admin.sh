#!/usr/bin/env bash
# Creates a user with this email in the local database (if there is none yet) and makes it admin.
#   scripts/db-admin.sh me@example.org
# The local database must be running (scripts/db-migrate.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

[ $# -eq 1 ] && [[ "$1" == *?@?* ]] || { echo "usage: $0 <email>" >&2; exit 2; }

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  echo "docker compose is not installed" >&2
  exit 1
fi

# The email goes in as a psql variable (:'email' quotes it), never into the SQL text.
"${compose[@]}" exec -T db psql -U postgres -d badminton -v ON_ERROR_STOP=1 -q -v email="$1" <<'SQL'
insert into auth.users (email, raw_user_meta_data)
select :'email', jsonb_build_object('full_name', split_part(:'email', '@', 1))
where not exists (select 1 from auth.users where email = :'email');

insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = :'email'
on conflict do nothing;

select u.id, u.email, string_agg(ur.role, ', ' order by ur.role) as roles
from auth.users u join public.user_roles ur on ur.user_id = u.id
where u.email = :'email' group by u.id, u.email;
SQL
