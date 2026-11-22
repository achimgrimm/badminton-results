# OT Bremen Badminton – Ergebnisse

Mobile-friendly view of every badminton team of **TSV Osterholz-Tenever (OT Bremen)**, season 2026/27: next match, league table, full schedule, every Spielbericht, match previews and player statistics. Data is scraped from [nuLiga](https://brbv-badminton.liga.nu/cgi-bin/WebObjects/nuLigaBADDE.woa/wa/clubTeams?club=11473), which has no public API.

The site root is a team chooser. Each team lives in its own folder (`aktive/`, `aktive-2/`, `aktive-3/`, `jugend/`, `jugend-2/`, `schueler/`). The app remembers the last team and opens it next time; `index.html#auswahl` always shows the chooser.

## Usage

Tools are managed with [mise](https://mise.jdx.dev) (`mise.toml` pins Node 22 and the GitHub CLI):

```sh
mise install       # install Node and gh
mise run update    # test, scrape, build
mise run serve     # preview dist/
mise tasks         # list all tasks
```

Or with npm directly:

```sh
npm install
npm run scrape   # fetch nuLiga pages -> data/*.json
npm run build    # data/*.json -> dist/ (static HTML)
npm run serve    # preview dist/ locally
npm test         # parser tests against test/fixtures
```

## How it works

1. **Scrape** (`npm run scrape`): reads the club's team list from nuLiga, then each league's table, schedule and new Spielberichte (at most 1 request per second). The result is stored as JSON in `data/`, which is not in git.
2. **Build** (`npm run build`): turns `data/` into plain static HTML in `dist/`, styled with the club's design (`src/styles.css`). No server is needed.
3. **Deploy**: a GitHub Actions workflow does both every hour and on every push to `main`, and publishes to GitHub Pages. If the build fails, the last good version stays online.

The site is an installable PWA that also works offline with the last cached data. Without signing in, everything (chosen player, "Ich spiele" answers, lineup drafts) stays on the device.

Optional **online features** (Google sign-in, synced answers, published lineups, push notifications, roles) run on Supabase and are switched off when `SUPABASE_URL` in `src/config.ts` is empty. Usage is counted cookieless with Umami.

Project layout:

| Path | Contents |
| --- | --- |
| `src/scrape.ts`, `src/parse/` | nuLiga scraping and parsers (tests in `test/`, fixtures in `test/fixtures/`) |
| `src/render/`, `src/client/` | HTML pages and browser code |
| `supabase/` | database migrations and Edge Functions |
| `manual/` | user manual, one section per feature |
| `release-notes/` | "Was ist neu?" announcements |
| `.github/workflows/` | update, stage and migration workflows |

If nuLiga changes its markup, update the matching parser and refresh its fixture. Implementation details of every feature are in [docs/internals.md](docs/internals.md) (written for coding agents; see also [AGENTS.md](AGENTS.md)).

## Test stages

Every pushed branch (except Dependabot's) gets its own test stage at `https://achimgrimm.github.io/badminton-results/stage/<branch>/`. The branch name is lowercased and other characters become `-`, so `feature/Lineup` is served at `stage/feature-lineup/`. `main` is the live site.

- Pushing or deleting a branch runs `.github/workflows/stage.yml`, which starts the main workflow on `main` (only `main` may deploy to GitHub Pages). So a stage appears a few minutes after the push and disappears when the branch is deleted.
- A stage is built with `STAGE=<branch>`. It shows a "Testversion" banner, isn't indexed or counted by Umami, installs as a separate app ("OT Test <stage>"), and prefixes its localStorage keys with `stage-<stage>-`, so testing never touches the live app's data. The live service worker ignores `stage/`.
- `mise run release`, run on the branch, releases it. It checks that the branch is pushed and that its stage already shows that commit, fast-forwards `main` to it and deletes the branch in one atomic push. The push run on `main` deploys it live and already drops the stage, so `stage.yml` skips its own run for that delete. If `main` has moved on, rebase, push and test the stage again.
- Local preview of a stage next to live: `npm run build && STAGE=my-branch npm run build && npm run serve`, then open `/stage/my-branch/`. A live build clears `dist/`, so build live first.

## Manual and release notes

The user manual lives in `manual/` (one section per feature, shown on the page "Handbuch"); announcements for users live in `release-notes/`. When a feature changes, update the matching manual section and add a release note. The file formats are described in [AGENTS.md](AGENTS.md).

## Live site

https://achimgrimm.github.io/badminton-results/

GitHub pauses scheduled workflows in public repos after 60 days without repo activity. If the site stops updating, re-enable "Update results" in the Actions tab.

## New season / other club

Teams are discovered from the club page, so a new season only needs `SEASON_LABEL` in `src/config.ts`. For another club, change `CLUB` (nuLiga club ID), `CLUB_NAME`, `CLUB_PREFIX` (the team name used in the leagues), `POOLS` (which roster age classes belong to which team label) and replace `src/icons/club-logo.png`. Then delete `data/` and run the scrape again.

The club logo in the header is TSV Osterholz-Tenever's; it is used with the user's OK (the other clubs' logos on the match pages come from nuLiga) and the site stays labelled "Inoffizielle Ansicht".
