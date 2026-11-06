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
- `.github/workflows/update.yml` runs hourly and on every push to `main`. It builds the live site from `main` and a test stage from every other branch (see [Test stages](#test-stages)), each with its own tests, scrape and data cache, and deploys them together to GitHub Pages. If the live build fails, nothing is deployed and the last good deploy stays online; a failing stage only misses its folder.
- The site is an installable PWA. `src/render/pwa.ts` generates the manifest and the service worker. Pages are network-first with an offline fallback to the last cached copy. The app icons in `src/icons/` are rendered from `icon.svg`.
- Results of the selected team that are new on the device get a "Neu" badge for 24 hours (or until their Spielbericht is opened). The client script `NEW_RESULTS` in `src/render/layout.ts` keeps first-seen times in localStorage under `seen-<team slug>`; on the first visit to a team nothing is marked. Results first seen on a page load are also listed once in a pop-up (Umami event `new-results`).
- Players can mark the own matches they play in ("Ich spiele" next to every unplayed match card, in the "Nächstes Spiel" box and on the Vorschau page; on the Übersicht only while no player is chosen). Marked matches get a "Dabei" badge, also after the result is in, and the Spielplan filter "Meine Spiele" shows only them. The Spielplan's always visible "Meine Spiele teilen" button sends the upcoming marked matches (date, time, home/away, opponent, Vorschau link) as plain text through the phone's share sheet (WhatsApp, Signal, …), falling back to the clipboard; with none marked it asks to mark matches first. The client script `PLAYING` in `src/render/layout.ts` keeps the marked `previewName` keys (`heim-<opponent>`/`auswaerts-<opponent>`) in localStorage under `playing-<team slug>-<season>`; nothing leaves the device (Umami event `playing`).
- Players can tell the app who they are ("Wer bist Du?" on the Spieler page, or "Das bin ich" on a player page). The list comes from nuLiga's club roster (`clubPools`, Vereinsrangliste): the team's Stammspieler and the club's reserve players of its age classes (`POOLS` in `src/config.ts`; the Rückrunde roster once nuLiga has one), plus anyone else who played for the team in a Spielbericht. The scrape stores it in `data/rosters/<slug>.json`. The chosen player is highlighted in the Spielberichte and the player list (sorted by the name as shown, first name first; the chosen player on top), and their player page says "Das bist Du". Played matches whose Spielbericht lists them count as theirs, tagged or not: "Dabei" badge and the Spielplan filter "Meine Spiele" (the build puts the OT lineup's person ids on each played card as `data-players`). With a player chosen, the Übersicht shows only their matches: the hero is their next marked match ("Kein Spiel markiert" with a link to the Spielplan if there is none), "Weitere Spiele" the later marked ones, and results only theirs of the last 14 days, without "Ich spiele" toggles (script `PERSONAL` in `src/render/index.ts`). The client script `ME` in `src/render/layout.ts` keeps `{ person, name }` in localStorage under `me-<team slug>-<season>`, per team; nothing leaves the device (Umami event `me`).
- "Spiele in Deinen Kalender" (on the Spielplan, next to ".ics herunterladen") subscribes to nuLiga's `webcal:` feed. Android has no handler for `webcal:`, so there the button links to Google Calendar's "add by URL" page (`calendar.google.com/calendar/r?cid=…`) instead; the subscription stays up to date and syncs to the phone's calendar app (Umami event `calendar`, `via`: `google` or `webcal`).
- Usage is counted with [Umami Cloud](https://cloud.umami.is) (cookieless, no consent banner needed). The website ID is `UMAMI_WEBSITE_ID` in `src/config.ts`; an empty ID turns tracking off. Only the live domain is counted, not local previews. Every page view is tagged `app` (installed PWA) or `browser`; events: `theme`, `install-click`, `install-accepted`/`install-dismissed`, `app-installed`, `open-in-chrome`, `share`, `new-results`, `release-notes`, `playing`, `share-plan`, `calendar`, `me`.
- The footer shows the data timestamp and the git commit the site was built from (short hash linked to GitHub, commit date). Without git the build still works, just without the version.
- `data/` is not in git. The workflow keeps it in the GitHub Actions cache between runs. If the cache is evicted, the next run simply fetches all Spielberichte again.

## Test stages

Every pushed branch (except Dependabot's) gets its own test stage at `https://achimgrimm.github.io/badminton-results/stage/<branch>/`. The branch name is lowercased and other characters become `-`, so `feature/Lineup` is served at `stage/feature-lineup/`. `main` is the live site.

- Pushing or deleting a branch runs `.github/workflows/stage.yml`, which starts the main workflow on `main` (only `main` may deploy to GitHub Pages). So a stage appears a few minutes after the push and disappears when the branch is deleted.
- A stage is built with `STAGE=<branch>`. It shows a "Testversion" banner, isn't indexed or counted by Umami, installs as a separate app ("OT Test <stage>"), and prefixes its localStorage keys with `stage-<stage>-`, so testing never touches the live app's data. The live service worker ignores `stage/`.
- `mise run release`, run on the branch, releases it. It checks that the branch is pushed and that its stage already shows that commit, fast-forwards `main` to it and deletes the branch in one atomic push. The push run on `main` deploys it live and already drops the stage, so `stage.yml` skips its own run for that delete. If `main` has moved on, rebase, push and test the stage again.
- Local preview of a stage next to live: `npm run build && STAGE=my-branch npm run build && npm run serve`, then open `/stage/my-branch/`. A live build clears `dist/`, so build live first.

## Release notes

Tell users about new features with a file in `release-notes/`, named `YYYY-MM-DD-<slug>.md` (lowercase, digits, dashes):

```md
# Short title

What's new, in Markdown: paragraphs, lists, **bold**, [links](https://…).
```

The build (`src/releases.ts`, using `marked`) embeds the three newest notes in every page. On their next visit to a team page, users who already used the app see the notes newer than the last one they closed (localStorage `releaseSeen`); after a new-results pop-up, if there is one. New users skip the existing notes. The footer link "Was ist neu?" shows them anytime. A bad file name or a missing `# ` title fails the build. Umami event: `release-notes` (`via`: `auto` or `footer`).

## Live site

https://achimgrimm.github.io/badminton-results/

GitHub pauses scheduled workflows in public repos after 60 days without repo activity. If the site stops updating, re-enable "Update results" in the Actions tab.

## New season / other club

Teams are discovered from the club page, so a new season only needs `SEASON_LABEL` in `src/config.ts`. For another club, change `CLUB` (nuLiga club ID), `CLUB_NAME`, `CLUB_PREFIX` (the team name used in the leagues), `POOLS` (which roster age classes belong to which team label) and replace `src/icons/club-logo.png`. Then delete `data/` and run the scrape again.

The club logo in the header is TSV Osterholz-Tenever's; it is used with the user's OK and the site stays labelled "Inoffizielle Ansicht".
