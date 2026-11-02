import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadClubTeams, loadDataset, type Dataset } from "./data.ts";
import type { MatchReport, Meeting, Standing } from "./types.ts";
import { renderBericht } from "./render/bericht.ts";
import { renderChooser } from "./render/chooser.ts";
import { setTeam, setVersion, type BuildVersion } from "./render/context.ts";
import { renderIndex } from "./render/index.ts";
import { renderManifest, renderServiceWorker } from "./render/pwa.ts";
import { ownPlayers, playerLinker, renderSpieler, renderSpielerListe } from "./render/spieler.ts";
import { renderSpielplan } from "./render/spielplan.ts";
import { renderTabelle } from "./render/tabelle.ts";
import { hasPreview, previewName } from "./render/util.ts";
import { renderIcs, renderVorschau } from "./render/vorschau.ts";

function stubReport(m: Meeting): MatchReport {
  return {
    meeting: m.meeting!, home: m.home, guest: m.guest, date: m.date, time: m.time, games: [],
    totals: { points: null, sets: null, games: m.result }, start: null, end: null, referees: [],
    approved: m.approved, pdfUrl: null,
  };
}

const SRC = new URL(".", import.meta.url).pathname;
const DIST = new URL("../dist/", import.meta.url).pathname;

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

const teams = loadClubTeams();
if (teams.length === 0) throw new Error("no data – run `npm run scrape` first");
const now = new Date();

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "icons"), { recursive: true });

/** Renders one team's pages into dist/<slug>/; returns the page count. */
function buildTeam(d: Dataset): number {
  const dir = join(DIST, d.own.slug);
  for (const sub of ["bericht", "vorschau", "spieler"]) mkdirSync(join(dir, sub), { recursive: true });
  const write = (file: string, content: string) => writeFileSync(join(dir, file), content);

  write("index.html", renderIndex(d, now));
  write("tabelle.html", renderTabelle(d));
  write("spielplan.html", renderSpielplan(d, now));
  const players = ownPlayers(d);
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
  for (const m of previews) {
    write(`vorschau/${previewName(m)}.html`, renderVorschau(d, m));
    write(`vorschau/${previewName(m)}.ics`, renderIcs(d, m, now));
  }
  return 4 + Object.keys(d.reports).length + missing.length + players.length + previews.length;
}

let pages = 0;
let checkedAt: string | null = null;
const standings = new Map<string, Standing | undefined>();
for (const team of teams) {
  setTeam(team, teams);
  const d = loadDataset(team);
  if (d.table.length === 0) throw new Error(`no table for ${team.label} – run \`npm run scrape\` first`);
  const count = buildTeam(d);
  console.log(`${team.label}: ${count} pages`);
  pages += count;
  checkedAt = d.meta.checkedAt;
  standings.set(team.slug, d.table.find((s) => s.team === team.name));
}

setTeam(null, teams);
writeFileSync(join(DIST, "index.html"), renderChooser(teams, standings, checkedAt));

copyFileSync(join(SRC, "styles.css"), join(DIST, "styles.css"));
copyFileSync(join(SRC, "favicon.svg"), join(DIST, "favicon.svg"));
copyFileSync(join(SRC, "icons", "club-logo.png"), join(DIST, "club-logo.png"));
for (const icon of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
  copyFileSync(join(SRC, "icons", icon), join(DIST, "icons", icon));
}
writeFileSync(join(DIST, "manifest.webmanifest"), renderManifest());
writeFileSync(join(DIST, "sw.js"), renderServiceWorker(now.getTime().toString(36)));
writeFileSync(join(DIST, ".nojekyll"), "");

console.log(`built ${pages + 1} pages for ${teams.length} teams into dist/`);
