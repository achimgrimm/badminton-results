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

- `src/scrape.ts` reads the club's team list from nuLiga on every run, so new teams or a new season need no code change. For each league it fetches the table and schedule (at most 1 request/s), plus a Spielbericht only when it is new or not yet approved; leagues with two OT teams (Jugend, Jugend II) are fetched once. Each hall address is fetched once. Data lives in `data/groups/<group>/` and `data/teams/<slug>.json`.
- Youth leagues use numbered pairings (`D1-D1`, `2-2`), stored as `D1`, `E2`.
- `src/parse/*` hold the cheerio parsers for each nuLiga page type. If nuLiga changes its markup, update the matching parser and refresh the fixture in `test/fixtures/`.
- `src/render/*` render the plain HTML pages. Styling follows the OT design tokens in `src/styles.css`.
- `.github/workflows/update.yml` runs hourly and on every push to `main`. It tests, scrapes, builds and deploys `dist/` to GitHub Pages. If a parse fails, the job fails and the last good deploy stays online.
- The site is an installable PWA. `src/render/pwa.ts` generates the manifest and the service worker. Pages are network-first with an offline fallback to the last cached copy. The app icons in `src/icons/` are rendered from `icon.svg`.
- Usage is counted with [Umami Cloud](https://cloud.umami.is) (cookieless, no consent banner needed). The website ID is `UMAMI_WEBSITE_ID` in `src/config.ts`; an empty ID turns tracking off. Only the live domain is counted, not local previews. Every page view is tagged `app` (installed PWA) or `browser`; events: `theme`, `install-click`, `install-accepted`/`install-dismissed`, `app-installed`, `open-in-chrome`, `share`.
- `data/` is not in git. The workflow keeps it in the GitHub Actions cache between runs. If the cache is evicted, the next run simply fetches all Spielberichte again.

## Live site

https://achimgrimm.github.io/badminton-results/

GitHub pauses scheduled workflows in public repos after 60 days without repo activity. If the site stops updating, re-enable "Update results" in the Actions tab.

## New season / other club

Teams are discovered from the club page, so a new season only needs `SEASON_LABEL` in `src/config.ts`. For another club, change `CLUB` (nuLiga club ID), `CLUB_NAME`, `CLUB_PREFIX` (the team name used in the leagues) and replace `src/icons/club-logo.png`. Then delete `data/` and run the scrape again.

The club logo in the header is TSV Osterholz-Tenever's; it is used with the user's OK and the site stays labelled "Inoffizielle Ansicht".
