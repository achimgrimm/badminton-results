import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";
import { ONLINE, STAGE, STORAGE_NAMES, STORAGE_PREFIXES, SUPABASE_ANON_KEY, SUPABASE_URL, storageKey } from "./config.ts";
import { DATA_DIR, loadClubTeams, loadClubs, loadDataset, paths, type Dataset } from "./data.ts";
import type { MatchReport, Meeting, Standing } from "./types.ts";
import { renderBericht } from "./render/bericht.ts";
import { renderDatenschutz } from "./render/datenschutz.ts";
import { renderAuthCallback } from "./render/auth-callback.ts";
import { renderChooser } from "./render/chooser.ts";
import { setLineups, setOnlineHref, setRoster, setReleases, setStylesHref, setTeam, setVersion, stylesHref, type BuildVersion } from "./render/context.ts";
import { loadReleases } from "./releases.ts";
import { ownLineups } from "./lineup.ts";
import { renderIndex } from "./render/index.ts";
import { renderManifest, renderServiceWorker } from "./render/pwa.ts";
import { opponentDir, opponentPlayers, ownPlayers, pickablePlayers, playerLinker, renderSpieler, renderSpielerListe } from "./render/spieler.ts";
import { renderSpielplan } from "./render/spielplan.ts";
import { renderTabelle } from "./render/tabelle.ts";
import { hasPreview, involvesOwn, opponentOf, previewHref, previewName, todayInBremen } from "./render/util.ts";
import { renderIcs, renderVorschau } from "./render/vorschau.ts";

function stubReport(m: Meeting): MatchReport {
  return {
    meeting: m.meeting!, home: m.home, guest: m.guest, date: m.date, time: m.time, games: [],
    totals: { points: null, sets: null, games: m.result }, start: null, end: null, referees: [],
    approved: m.approved, pdfUrl: null,
  };
}

const SRC = new URL(".", import.meta.url).pathname;
/** The live site goes into dist/, a test stage into dist/stage/<name>/ (as served), so both can be previewed together. */
const DIST = new URL(STAGE ? `../dist/stage/${STAGE}/` : "../dist/", import.meta.url).pathname;

/** The checked-out commit, shown in the footer; the build works without git, just without it. */
function gitVersion(): BuildVersion | null {
  try {
    const [sha, date] = execFileSync("git", ["log", "-1", "--format=%H %cI"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim().split(" ");
    return sha && date ? { sha, date } : null;
  } catch {
    return null;
  }
}
setVersion(gitVersion());
setStylesHref(`styles.css?v=${createHash("sha256").update(readFileSync(join(SRC, "styles.css"))).digest("hex").slice(0, 10)}`);
setReleases(loadReleases(new URL("../release-notes/", import.meta.url).pathname));

/** Bundles supabase-js and the sign-in script into one file; returns its hashed URL. */
function buildOnlineBundle(outDir: string): string {
  const out = buildSync({
    entryPoints: [join(SRC, "client", "online.ts")],
    bundle: true, minify: true, format: "iife", target: "es2020", write: false,
    define: {
      SUPABASE_URL: JSON.stringify(SUPABASE_URL),
      SUPABASE_ANON_KEY: JSON.stringify(SUPABASE_ANON_KEY),
      STORAGE_KEY: JSON.stringify(storageKey("auth")),
      OWN_KEYS: JSON.stringify({ names: STORAGE_NAMES.map(storageKey), prefixes: STORAGE_PREFIXES.map(storageKey) }),
    },
  }).outputFiles[0];
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "online.js"), out.contents);
  return `online.js?v=${createHash("sha256").update(out.contents).digest("hex").slice(0, 10)}`;
}

const teams = loadClubTeams();
if (teams.length === 0) throw new Error("no data – run `npm run scrape` first");
const now = new Date();

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "icons"), { recursive: true });
if (ONLINE) setOnlineHref(buildOnlineBundle(DIST));

/** Renders one team's pages into dist/<slug>/; returns the page count. */
function buildTeam(d: Dataset): number {
  setLineups(ownLineups(d));
  const players = ownPlayers(d);
  setRoster(pickablePlayers(d, players).map((p) => ({ person: p.person, name: p.name, href: p.href })));
  const dir = join(DIST, d.own.slug);
  for (const sub of ["bericht", "vorschau", "spieler"]) mkdirSync(join(dir, sub), { recursive: true });
  const write = (file: string, content: string) => writeFileSync(join(dir, file), content);

  write("index.html", renderIndex(d, now));
  write("tabelle.html", renderTabelle(d));
  write("spielplan.html", renderSpielplan(d, now));
  const link = playerLinker(players, "../");
  for (const r of Object.values(d.reports)) {
    write(`bericht/${r.meeting}.html`, renderBericht(d, r, d.schedule.find((m) => m.meeting === r.meeting), link));
  }
  // Played meetings whose report nuLiga hasn't served yet still get a page, so links don't 404.
  const missing = d.schedule.filter((m) => m.meeting && m.result && !d.reports[m.meeting]);
  for (const m of missing) write(`bericht/${m.meeting}.html`, renderBericht(d, stubReport(m), m));
  write("spieler.html", renderSpielerListe(d, players));
  for (const p of players) write(`spieler/${p.slug}.html`, renderSpieler(d, p));
  const previews = d.schedule.filter(hasPreview);
  // The opponents' players get pages too, linked from the preview and leading back to it.
  const opponents = new Map<string, ReturnType<typeof opponentPlayers>>();
  let opponentPages = 0;
  for (const m of previews) {
    const team = opponentOf(m);
    if (opponents.has(team)) continue;
    const list = opponentPlayers(d, team);
    opponents.set(team, list);
    mkdirSync(join(dir, opponentDir(team)), { recursive: true });
    for (const p of list) {
      write(`${opponentDir(team)}${p.slug}.html`, renderSpieler(d, p, { back: { href: previewHref("../../", m), label: "Vorschau" } }));
    }
    opponentPages += list.length;
  }
  for (const m of previews) {
    write(`vorschau/${previewName(m)}.html`, renderVorschau(d, m, opponents.get(opponentOf(m))!));
    write(`vorschau/${previewName(m)}.ics`, renderIcs(d, m, now));
  }
  return 4 + Object.keys(d.reports).length + missing.length + players.length + previews.length + opponentPages;
}

let pages = 0;
let checkedAt: string | null = null;
const standings = new Map<string, Standing | undefined>();
const nextMatches = new Map<string, Meeting | undefined>();
const today = todayInBremen(new Date());
for (const team of teams) {
  setTeam(team, teams);
  const d = loadDataset(team);
  if (d.table.length === 0) throw new Error(`no table for ${team.label} – run \`npm run scrape\` first`);
  const count = buildTeam(d);
  console.log(`${team.label}: ${count} pages`);
  pages += count;
  checkedAt = d.meta.checkedAt;
  standings.set(team.slug, d.table.find((s) => s.team === team.name));
  nextMatches.set(
    team.slug,
    d.schedule
      .filter((m) => involvesOwn(m) && !m.result && m.date >= today)
      .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))[0],
  );
}

setTeam(null, teams);
writeFileSync(join(DIST, "index.html"), renderChooser(teams, standings, nextMatches, checkedAt));

writeFileSync(join(DIST, "datenschutz.html"), renderDatenschutz(checkedAt));
if (ONLINE) writeFileSync(join(DIST, "auth-callback.html"), renderAuthCallback());

copyFileSync(join(SRC, "styles.css"), join(DIST, "styles.css"));
copyFileSync(join(SRC, "favicon.svg"), join(DIST, "favicon.svg"));
// Google Search Console ownership proof (needed for the OAuth app branding); keep it published.
copyFileSync(join(SRC, "google49559f935a48ddad.html"), join(DIST, "google49559f935a48ddad.html"));
copyFileSync(join(SRC, "icons", "club-logo.png"), join(DIST, "club-logo.png"));
for (const icon of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
  copyFileSync(join(SRC, "icons", icon), join(DIST, "icons", icon));
}
// Club logos of the match pages (downloaded by the scrape; clubs without one just show no logo).
const clubs = loadClubs().filter((c) => c.logo);
if (clubs.length) mkdirSync(join(DIST, "logos"), { recursive: true });
for (const c of clubs) copyFileSync(join(DATA_DIR, paths.logos, c.logo!), join(DIST, "logos", c.logo!));
writeFileSync(join(DIST, "manifest.webmanifest"), renderManifest());
writeFileSync(join(DIST, "sw.js"), renderServiceWorker(now.getTime().toString(36), stylesHref()));
writeFileSync(join(DIST, ".nojekyll"), "");

console.log(`built ${pages + 1} pages for ${teams.length} teams into ${STAGE ? `dist/stage/${STAGE}/` : "dist/"}`);
