# Player concept in cloud mode

## Identity
- There is no `players` table. A player is a nuLiga `person` integer, the same on every team.
- The roster is scraped into `data/rosters/<slug>.json` (not in git). The type is `RosterPlayer {name, person, rank, role, gender?}` (`src/types.ts`).
- A team is a slug plus a season string, such as `aktive-2` and `2026/27`. Neither is a table.
- Players are never created in the app.
- **The pick is global.** One pick per device (local) and one claim per account (cloud), whatever the team or season. Answers, lineups and push stay per team, season and game.

## Local mode vs cloud mode
- `ONLINE` (`src/config.ts`) is true only when the Supabase URL and anon key are set. Cloud mode is then decided per user by whether they are signed in. Analytics reports this as `storage: local|cloud`.
- **Local (signed out):**
  - The chosen player `{person, name}` is in localStorage under the single key `me`.
  - Answers are in `playing-<slug>-<season>`.
  - Lineup drafts are on the device.
  - Nothing leaves the device.
  - `ME_MIGRATE` (`src/render/layout.ts`) moves the old per-team keys `me-<slug>-<season>` to `me` on first load. The pick of the page's team wins, otherwise the first key in sorted order.
- **Cloud (signed in, Google only):**
  - The pick becomes a claim in `player_claims`.
  - Answers sync both ways, and the newer change wins per game.
  - Cloud-only features: published lineups, "Verified" check marks, team answers in the lineup editor, push notifications, role management and claim approval.
  - Answers stay on the device after sign-out. "Abmelden" clears the chosen player on that device.
  - `delete_account()` cascades to the profile, roles, claims, answers and push subscriptions.
- **Pages:** the player page link is looked up in the page's team roster (`#me-roster`, embedded in every team page). A player who is not on a team's roster is highlighted nowhere on that team and has no "Meine Statistik" link there.

## Claims (`player_claims`)
- Columns: `user_id`, `person`, `player_name`, `status` (pending or approved), `decided_by`, `decided_at`.
- `unique(user_id)`: one claim per account.
- Only an approved claim owns a player. This is enforced by the partial unique index `player_claims_one_approved` on `person`. Pending claims for the same player can coexist.
- Approving one claim deletes the competing pending claims. Updates can only change the status.
- `20261122000000_global_player_claim.sql` made the claim global. It merged duplicates per account and kept the oldest approval per person. Accounts that lost an approval see "nicht bestätigt" and are asked again.
- RLS:
  - Select: your own row, or any row if you hold `player.link`.
  - Insert: only for yourself. `approved` needs `player.link`.
  - Update: only with `player.link`, so nobody approves themselves.
  - Delete: your own row, or any row with `player.link`. Rejecting a claim deletes the row.
- Flow:
  - After sign-in, `reconcile()` (`src/claims.ts`) runs. An approved claim wins over the device's pick. A pending claim only fills an empty device. Otherwise the device's pick is uploaded as a new claim.
  - `saveClaim` deletes the old row and inserts a new one. It is approved at once for approvers, otherwise pending.
  - Error 23505 means the player is taken. The pick then stays on the device only.
  - Rejection is detected when the claim has vanished from the server. The device then resets the pick.
  - `confirmPlayer` is the mandatory "Wer bist Du?" dialog on first sign-in. `matchPlayer` (`src/names.ts`) preselects the Google name only on a single exact match. It lists the roster of the page it is on.
  - Approvers use the "Anfragen prüfen" dialog.

## Roles and permissions
- Roles are `admin`, `team_lead`, `player` and `member`. Every new account gets `member`. Roles are global, not per team.
- `player` is assigned by a trigger on `player_claims` as soon as a claim is approved and removed again when it goes away. It grants no permission and can't be set by hand. An account that says "Nicht aktiver Spieler" in the "Wer bist Du?" dialog has `profiles.not_a_player` (set via `set_not_a_player`), so the app stops asking.
- `player.link` (admin, team_lead): approve or reject claims.
- `answers.read_all` (admin, team_lead): see the team's yes/maybe/no answers.
- `lineup.write`: publish lineups.

## Related tables and functions
- `game_answers`: key `(user_id, team_slug, season, game_key)`, state yes/maybe/no. Owner-only. The trigger `game_answers_keep_newer` skips older writes.
- `team_answers(team, season, game_key)`: joins answers to the approved claim by account. Requires `answers.read_all`.
- `verified_players()`: returns the person ids of all approved claims. Requires `player.link`.
- `published_lineups`: lineup per discipline as person ids. Every signed-in user reads it. Only `lineup.write` writes.
- `push_subscriptions`: per user. The Edge Function `notify-lineup` finds recipients through approved claims by person.

## Gaps and open items
- The name-to-person mapping lives only in scraped JSON, plus a copy in `player_claims.player_name`.
- Person-id stability across seasons is unverified. Only 2026/27 data was available. If nuLiga changes ids, a global pick points at the wrong person or nobody.
- Open issues: #24 (online backend, partly stale), #49 (notify approvers of a new sign-in), #51 (explain why to log in), #3 (Apple sign-in).

## Sources
- README cloud bullets.
- Migrations in `supabase/migrations/`.
- `src/claims.ts`, `src/client/online.ts`, `src/render/layout.ts`.
- Tests: `test/claims.test.ts`, `test/me-migrate.test.ts`.
