#!/usr/bin/env bash
# Releases the current branch: once its test stage shows exactly this commit, main is
# fast-forwarded to it and deployed live and the branch is deleted (which removes its stage).
set -euo pipefail

SITE="https://achimgrimm.github.io/badminton-results"
die() { echo "release: $*" >&2; exit 1; }

branch=$(git symbolic-ref --short HEAD 2>/dev/null) || die "not on a branch"
[ "$branch" != "main" ] || die "run this on the branch you want to release, not on main"
[ -z "$(git status --porcelain)" ] || die "working tree has uncommitted changes"

git fetch --quiet --prune origin
sha=$(git rev-parse HEAD)
[ "$(git rev-parse --verify --quiet "origin/$branch")" = "$sha" ] \
  || die "push $branch first: origin/$branch is not at your current commit"

# Same rule as stageName() in src/config.ts and the branch list in update.yml.
stage=$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
url="$SITE/stage/$stage/"
short=${sha:0:7}
# Fetched first: grep -q stops reading early, which makes curl fail under pipefail.
page=$(curl -fsS "${url}index.html") || die "can't load $url"
grep -q "/commit/$sha\">$short<" <<<"$page" \
  || die "the stage $url doesn't show $short yet: wait for the deploy, test it, then try again"

git merge-base --is-ancestor origin/main "$sha" \
  || die "main has moved on: rebase $branch on origin/main, push, test the stage again"

echo "Releasing $branch ($short) to main…"
git push origin "$sha:refs/heads/main"
# GitHub starts no push run for a commit that was already pushed on another branch, so start
# the live deploy explicitly.
gh workflow run update.yml --repo achimgrimm/badminton-results --ref main
git push origin --delete "$branch"
echo "Done. Live after the deploy: $SITE/"
echo "Locally: git switch main && git pull && git branch -d $branch"
