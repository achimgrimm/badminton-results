# OT Bremen III – Ergebnisse

Mobile-friendly view of the Kreisliga Bremen (BrBV, season 2026/27) for **OT Bremen III**: next match, league table, full schedule and every Spielbericht. Data is scraped from [nuLiga](https://brbv-badminton.liga.nu/cgi-bin/WebObjects/nuLigaBADDE.woa/wa/groupPage?championship=KV+Bremen+26%2F27&group=41836), which has no public API.

## Usage

Tools are managed with [mise](https://mise.jdx.dev) (`mise.toml` pins Node 22):

```sh
mise install       # install Node
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

- `src/scrape.ts` fetches the table, schedule and team page on every run (at most 1 request/s). It fetches a Spielbericht only when it is new or not yet approved. Each hall address is fetched once.
- `src/parse/*` hold the cheerio parsers for each nuLiga page type. If nuLiga changes its markup, update the matching parser and refresh the fixture in `test/fixtures/`.
- `src/render/*` render the plain HTML pages. Styling follows the OT design tokens in `src/styles.css`.
- `.github/workflows/update.yml` runs hourly. It tests, scrapes, builds, commits changed `data/` and deploys `dist/` to GitHub Pages. If a parse fails, the job fails and the last good deploy stays online.

## Setup on GitHub

1. Push this repo to GitHub (branch `main`).
2. Go to Settings → Pages → Source and choose **GitHub Actions**.
3. Run the "Update results" workflow once by hand (Actions tab), or push.

## New season / other team

Edit `src/config.ts`: `CHAMPIONSHIP`, `GROUP`, `OWN_TEAM`, `OWN_TEAMTABLE`, `SEASON_LABEL`. Then delete `data/` and run the scrape again.
