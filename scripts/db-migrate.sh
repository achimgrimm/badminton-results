#!/usr/bin/env bash
# Runs the migrate workflow (.github/workflows/migrate.yml) on the current branch and waits for it.
# The workflow checks out the pushed branch, so push first. There is one database for the live site
# and all stages: only apply non-breaking migrations from a branch (see the db-migrate skill).
set -euo pipefail

die() { echo "db-migrate: $*" >&2; exit 1; }

branch=$(git symbolic-ref --short HEAD 2>/dev/null) || die "not on a branch"
git fetch --quiet --prune origin
[ "$(git rev-parse --verify --quiet "origin/$branch")" = "$(git rev-parse HEAD)" ] \
  || die "push $branch first: origin/$branch is not at your current commit"
git diff --quiet HEAD -- supabase || die "supabase/ has uncommitted changes"

echo "Migrations on $branch that main doesn't have yet:"
git diff --name-only --diff-filter=A origin/main HEAD -- supabase/migrations | sed 's/^/  /' || true

before=$(gh run list --workflow=migrate.yml --branch "$branch" --limit 1 --json databaseId -q '.[0].databaseId // 0')
gh workflow run migrate.yml --ref "$branch"
echo "Waiting for the run to start…"
run=$before
for _ in $(seq 1 30); do
  run=$(gh run list --workflow=migrate.yml --branch "$branch" --limit 1 --json databaseId -q '.[0].databaseId // 0')
  [ "$run" != "$before" ] && break
  sleep 2
done
[ "$run" != "$before" ] || die "the run didn't show up; check the Actions tab"
gh run watch "$run" --exit-status
gh run view "$run" --log | grep -E "Applying migration|Remote database is up to date|Finished" || true
