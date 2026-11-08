#!/usr/bin/env bash
# Applies supabase/migrations/*.sql to the local Postgres from docker-compose.yml, in file order.
# Applied files are recorded in local_migrations.applied, so running it again only applies new ones.
#
#   scripts/db-migrate.sh           start the database if needed and apply new migrations
#   scripts/db-migrate.sh --reset   throw the local database away first, then apply everything
#   scripts/db-migrate.sh --psql    open psql on the local database
set -euo pipefail
cd "$(dirname "$0")/.."

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  echo "docker compose is not installed" >&2
  exit 1
fi

psql_in_db() { "${compose[@]}" exec -T db psql -U postgres -d badminton -v ON_ERROR_STOP=1 -q "$@"; }

case "${1:-}" in
  --reset) "${compose[@]}" down -v ;;
  --psql) open_psql=1 ;;
  "") ;;
  *) echo "usage: $0 [--reset|--psql]" >&2; exit 2 ;;
esac

"${compose[@]}" up -d db
echo -n "waiting for the database "
for _ in $(seq 1 60); do
  if "${compose[@]}" exec -T db pg_isready -U postgres -d badminton -q 2>/dev/null; then ready=1; break; fi
  echo -n "."; sleep 1
done
echo
[ "${ready:-}" = 1 ] || { echo "the database did not start" >&2; exit 1; }

if [ "${open_psql:-}" = 1 ]; then exec "${compose[@]}" exec db psql -U postgres -d badminton; fi

psql_in_db < supabase/local/bootstrap.sql
psql_in_db -c "set client_min_messages = warning; create schema if not exists local_migrations; create table if not exists local_migrations.applied (name text primary key, applied_at timestamptz not null default now());"

applied=0
for file in supabase/migrations/*.sql; do
  name=$(basename "$file")
  done_already=$(psql_in_db -tA -c "select 1 from local_migrations.applied where name = '$name'")
  if [ -n "$done_already" ]; then continue; fi
  echo "applying $name"
  # One transaction per file: a failing migration leaves nothing half applied.
  { echo "begin;"; cat "$file"; echo; echo "insert into local_migrations.applied (name) values ('$name');"; echo "commit;"; } | psql_in_db
  applied=$((applied + 1))
done
echo "done, $applied new migration(s) applied"
