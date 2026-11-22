# Agent guide

Static site (TypeScript, cheerio, esbuild) that scrapes nuLiga into `data/` and builds `dist/`; optional online features run on Supabase. Overview for humans: `README.md`.

## Where to look

- `docs/internals.md`: per-feature implementation details (scrape, parsers, PWA, "Ich spiele", player claims, lineups, push, Umami events, Supabase schema, CSP, logos). Read the relevant bullet before changing a feature and keep it current.
- `docs/player-concept-cloud-mode.md`: concept for local vs. cloud mode.
- `src/parse/*` (nuLiga parsers, fixtures in `test/fixtures/`), `src/render/*` (HTML pages), `src/client/*` (browser code), `supabase/` (migrations, Edge Functions), `src/config.ts` (all settings).
- Skills in `.claude/skills/`: `backlog-issue`, `db-migrate`, `notifications`, `otbremen-design`, `release-note`.

## Rules

- Use gender-neutral German in every text for users (UI, release notes, notifications, issues): "Spielende", "Mannschaftsführung", "Admin", "Personen". Code identifiers, URLs and nuLiga terms (Herren, Damen) stay as they are.
- Run `npm test` after changes; if nuLiga markup changes, update the parser and its fixture.
- Database changes: use the `db-migrate` skill. User messages: use the `notifications` skill. UI styling: `otbremen-design`.
- A new external host must be added to the `CSP` in `src/render/layout.ts` (`test/menu.test.ts` checks it).
- Adding a Umami event or session property: see the analytics bullet in `docs/internals.md`.

## User manual (`manual/`)

One Markdown file per role, `<number>-<role>.md`, front matter `role:` (`member` = signed out, `signed_in`, `player`, `team_lead`, `admin`) and a `# Title`. Each chapter builds on the previous ones and lists only what is added. `permissions:` lists the database permissions the chapter describes; `test/manual.test.ts` fails when the code checks a permission no chapter lists. `src/manual.ts` fails the build on a bad file. **When a feature is added, changed or removed, update the chapter of the role it concerns and add a release note.**

## Release notes (`release-notes/`)

File `YYYY-MM-DD-<slug>.md` (lowercase, digits, dashes) starting with a `# Title`, then Markdown. Optional front matter `roles: team_lead, admin` (valid: `admin`, `team_lead`, `player`, `member`; unknown names fail the build); none means everyone. Bug fixes are admin-only by default. Use the `release-note` skill. `src/releases.ts` embeds the notes; users see the ones for their roles, newer than the last one they closed (localStorage `releaseSeen`). Umami event `release-notes` (`via`: `auto`/`menu`).
