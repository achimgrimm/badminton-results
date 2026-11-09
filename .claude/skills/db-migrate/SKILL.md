---
name: db-migrate
description: Write and apply Supabase database migrations for this project (supabase/migrations/) so that nothing breaks for the live site, which shares the one database with every branch stage. Use for any schema, policy, permission or seed change, e.g. "add a table", "change the DB", "migrate the DB", "apply the migration", "/db-migrate <what>". Breaking changes only when the user explicitly asks for them.
---

# Database migrations

There is **one** hosted Supabase database. The live site (`main`) and every test stage (`stage/<branch>/`) use it at the same time. So a migration applied while working on a branch is live for the *currently deployed* app immediately. The rule that follows: **a migration must be non-breaking, so the app on `main` keeps working both before and after the branch is merged.** Then migrating from a branch is safe.

## 1. Non-breaking by default

Write migrations in the *expand* style: only add, never take away or tighten.

Allowed:
- `create table`, `create index`, `create function`, `create trigger` (new objects)
- `add column` that is nullable or has a `default`
- new `policy` that grants additional access, new rows in `roles`, `permissions`, `role_permissions`
- widening: a looser check constraint, a larger length, a new enum-like value in a text check
- inserting seed rows that nothing else depends on

Not allowed without an explicit request (these break the app that is live now):
- `drop table / column / policy / function / trigger / index used by a query`, `truncate`, `delete from`
- `rename` anything, `alter column ... type`, `set not null` on an existing column, a new `not null` column without default
- adding or tightening a `check`, `unique` or foreign key on a table that already has data or writers
- removing or narrowing a policy, `revoke`, changing what a function returns, changing a function's argument list
- `update` of existing rows (data rewrites)

If the requested feature seems to need one of those, find the additive way first (new column next to the old one, new table, new function name, a view). Say in one line what you did instead.

## 2. Breaking changes: only on request

Only when the user explicitly asks for a breaking change (e.g. "drop the old column", "remove that policy"):
1. Name exactly what the live app does with it today and what stops working (search `src/` for the table, column or function).
2. Prefer **expand now, contract later**: this migration only adds; a second migration that removes the old thing is written *after* the new app is live on `main`. Tell the user that the contract step has to wait for the release.
3. If they still want it in one step: ask for confirmation once, naming the consequence, and do not apply it from a branch. It is applied after the release (merge to `main`), where the migrate workflow runs it.
4. Mark such a file with a first comment line `-- BREAKING: <what> (requested by the user on <date>)`.

## 3. Writing the file

- Name: `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_case_name>.sql`. List the folder first; the timestamp must sort after the newest file (some are dated ahead of today, so take the max, not the clock).
- One topic per file. A header comment says what it is for and, for a policy or permission, who may do what.
- Never edit a migration that was already applied (or merged to `main`). Add a new file instead.
- New tables: `enable row level security` and add policies in the same file; permission checks use `public.has_permission('<permission>')`, and the feature adds its own `permissions` and `role_permissions` rows (see `20261109000000_rbac.sql`). No client may write role tables.
- Foreign keys to users go to `auth.users (id) on delete cascade` so `delete_account()` still removes everything.
- Update the README's online features paragraph when the schema, a permission or a policy changes.

## 4. Check before applying

There is no local database. Read the SQL once more and run this against the new file(s); every hit needs a reason (or the user's request from step 2):

```sh
grep -n -i -E "drop |truncate|delete from|rename|alter column|set not null|revoke|alter table .* add constraint|^update " supabase/migrations/<new file>.sql
```

Also check `git diff main -- supabase/migrations` shows only new files, no edits to old ones.

## 5. Apply

The workflow `.github/workflows/migrate.yml` runs on pushes to `main` that touch `supabase/**`, and manually (`workflow_dispatch`). Branch pushes and stage deploys do **not** run it. To migrate from a branch:

1. Commit and push the branch, so the migration file is in the repo.
2. Run `mise run db:migrate` (`scripts/db-migrate.sh`): it checks that the branch is pushed, starts the workflow on it and waits for the result. It uses the repository secret `SUPABASE_DB_URL`, so no password is needed locally. By hand, the same is:
   ```sh
   gh workflow run migrate.yml --ref <branch>
   gh run watch "$(gh run list --workflow=migrate.yml --branch <branch> --limit 1 --json databaseId -q '.[0].databaseId')"
   ```
   Applying from a branch is only for migrations that passed step 4 and are non-breaking.
3. Alternative by hand, if the CLI is installed: `supabase db push --dry-run --remote=<Session pooler string>` first, then without `--dry-run`. The user types it with the `!` prefix; never ask them to paste the database password into the chat.

Applying is outward-facing and not reversible: say which file(s) will be applied and wait for the user's go unless they already asked to apply it.

## 6. Verify

After the run, confirm the new objects exist, e.g. `select to_regclass('public.<table>')` in the user's DB client, and that the stage still works. Later merging to `main` re-runs the workflow, which skips migrations that are already recorded, so nothing is applied twice.
