import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLUB_REGIONS, urls, type PoolRound } from "./config.ts";
import { DATA_DIR, loadClubTeams, loadHalls, loadReports, paths, readJson, writeJson } from "./data.ts";
import { fetchBinary, fetchHtml, fetchHtmlWithCookie } from "./fetch.ts";
import { logoExtension } from "./logos.ts";
import { leagueName, parseClubTeams, teamSlug } from "./parse/club.ts";
import { parseClubLogo, parseClubSearch } from "./parse/clubs.ts";
import { parseReport, reportAvailable } from "./parse/report.ts";
import { parseSchedule } from "./parse/schedule.ts";
import { parseTable } from "./parse/table.ts";
import { parsePools } from "./parse/pools.ts";
import { parseCourt, parseTeam } from "./parse/team.ts";
import { poolTypes, teamRoster, type Pools } from "./roster.ts";
import type { Club, ClubTeam, Meeting } from "./types.ts";

const started = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s] ${msg}`);

// Files from the single-team layout, which may still come back from the Actions cache.
for (const legacy of ["table.json", "schedule.json", "team.json", "reports"]) {
  rmSync(join(DATA_DIR, legacy), { recursive: true, force: true });
}

const changed: string[] = [];

// Club teams: which leagues to follow
const rows = parseClubTeams(await fetchHtml(urls.clubTeams()));
if (rows.length === 0) throw new Error("club team list parsed empty");
log(`club: ${rows.length} teams in ${new Set(rows.map((r) => r.group)).size} leagues`);
const previousTeams = loadClubTeams();

const teams: ClubTeam[] = [];
const schedules: Meeting[] = [];

// Each league once, even when two OT teams play in it (Jugend, Jugend II)
for (const group of [...new Set(rows.map((r) => r.group))]) {
  const groupRows = rows.filter((r) => r.group === group);
  const g = { championship: groupRows[0].championship, group };
  const tag = `[${groupRows[0].league}]`;

  const table = parseTable(await fetchHtml(urls.table(g)));
  const schedule = parseSchedule(await fetchHtml(urls.schedule(g)));
  // Sanity checks: refuse to overwrite good data with an empty parse.
  if (table.length === 0) throw new Error(`${tag} table parsed empty`);
  if (schedule.length === 0) throw new Error(`${tag} schedule parsed empty`);
  log(`${tag} table: ${table.length} teams, schedule: ${schedule.length} meetings, ${schedule.filter((m) => m.result).length} with result`);
  if (writeJson(paths.table(group), table)) changed.push(`${tag} table`);
  if (writeJson(paths.schedule(group), schedule)) changed.push(`${tag} schedule`);
  schedules.push(...schedule);

  for (const row of groupRows) {
    const name = leagueName(row.label);
    const standing = table.find((s) => s.team === name);
    if (!standing?.teamtable) throw new Error(`${tag} team "${name}" (${row.label}) not found in table`);
    teams.push({ slug: teamSlug(row.label), label: row.label, name, league: row.league, ...g, teamtable: standing.teamtable });
  }

  // Reports: fetch new ones, and refetch until nuLiga marks them approved.
  const previous = loadReports(group);
  const played = schedule.filter((m) => m.meeting && m.result);
  const toFetch = played.filter((m) => !previous[m.meeting!]?.approved);
  log(`${tag} reports: ${toFetch.length} to fetch, ${played.length - toFetch.length} already approved`);
  for (const [i, m] of toFetch.entries()) {
    const meeting = m.meeting!;
    const known = previous[meeting];
    const label = `  [${i + 1}/${toFetch.length}] ${meeting} ${m.home} – ${m.guest}`;
    const page = await fetchHtml(urls.report(g, meeting));
    // nuLiga sometimes serves an empty page for a report that is being edited.
    // Keep the last good copy; any other parse error still fails the run.
    if (!reportAvailable(page)) {
      console.warn(`${label}: currently empty on nuLiga, ${known ? "keeping previous copy" : "skipped"}`);
      continue;
    }
    const report = parseReport(page, meeting);
    // The schedule's approval icon is the authoritative signal.
    report.approved ||= m.approved;
    const status = writeJson(paths.report(group, meeting), report) ? (known ? "updated" : "new") : "unchanged";
    if (status !== "unchanged") changed.push(`report ${meeting}`);
    log(`${label}: ${status}, ${report.games.length} games${report.approved ? ", approved" : ""}`);
  }
}

// Team pages: calendar links and home halls
for (const t of teams) {
  const info = parseTeam(await fetchHtml(urls.team(t, t.teamtable)));
  log(`team ${t.label} (${t.name}, ${t.league}): ${info.halls.length} halls`);
  if (writeJson(paths.team(t.slug), info)) changed.push(`team ${t.slug}`);
}
if (writeJson(paths.club, teams)) changed.push("club");

// Club rosters: who can play for which team, so players can pick themselves in the app.
const pools: Pools = {};
for (const type of [...new Set(teams.flatMap((t) => poolTypes(t.label)))]) {
  pools[type] = {};
  for (const round of ["vorrunde", "rueckrunde"] as PoolRound[]) {
    pools[type][round] = parsePools(await fetchHtml(urls.pools(type, round)));
  }
  log(`roster ${type}: ${pools[type].vorrunde!.length} Vorrunde, ${pools[type].rueckrunde!.length} Rückrunde`);
}
for (const t of teams) {
  const roster = teamRoster(t.label, pools);
  if (!roster.length) console.warn(`roster ${t.label}: no players listed`);
  if (writeJson(paths.roster(t.slug), roster)) changed.push(`roster ${t.slug}`);
}
const gone = previousTeams.filter((p) => !teams.some((t) => t.slug === p.slug));
if (gone.length) log(`teams no longer listed: ${gone.map((t) => t.label).join(", ")}`);

// Hall addresses rarely change; fetch each one once.
const halls = loadHalls();
const locations = new Set(schedules.map((m) => m.hall?.location).filter((l): l is number => l != null));
const newLocations = [...locations].filter((l) => !halls[l]);
log(`halls: ${newLocations.length} new of ${locations.size}`);
for (const location of newLocations) {
  halls[location] = parseCourt(await fetchHtml(urls.court(location)), location);
  log(`  hall ${location}: ${halls[location].name}`);
}
if (writeJson(paths.halls, halls)) changed.push("halls");

// Club logos for the match pages. The club lists are cheap; each club's page and logo are fetched once
// (logo null = none). A failure here only costs the logos, never the rest of the scrape.
try {
  const known = new Map(readJson<Club[]>(paths.clubs, []).map((c) => [c.id, c]));
  const clubs: Club[] = [];
  for (const region of CLUB_REGIONS) {
    for (const row of parseClubSearch(await fetchHtml(urls.clubSearch(region)))) {
      if (!clubs.some((c) => c.id === row.id)) clubs.push({ ...row, logo: known.get(row.id)?.logo?.endsWith(".svg") ? undefined : known.get(row.id)?.logo });
    }
  }
  if (clubs.length === 0) throw new Error("club list parsed empty");
  mkdirSync(join(DATA_DIR, paths.logos), { recursive: true });
  let fetched = 0;
  for (const club of clubs) {
    if (club.logo === null || (club.logo && existsSync(join(DATA_DIR, paths.logos, club.logo)))) continue;
    try {
      const page = await fetchHtmlWithCookie(urls.clubInfo(club.id));
      const src = parseClubLogo(page.html);
      if (!src) {
        club.logo = null; // the club has no logo
      } else {
        const image = await fetchBinary(src, page.cookie);
        const ext = logoExtension(image.type);
        if (!ext || image.data.length === 0) throw new Error(`logo is not an image (${image.type || "no type"}, ${image.data.length} bytes)`);
        club.logo = `${club.id}.${ext}`;
        writeFileSync(join(DATA_DIR, paths.logos, club.logo), image.data);
      }
      fetched++;
      log(`  logo ${club.name}: ${club.logo ?? "none"}`);
    } catch (err) {
      club.logo = undefined;
      console.warn(`logo ${club.name}: ${(err as Error).message}`);
    }
  }
  log(`clubs: ${clubs.length} listed, ${clubs.filter((c) => c.logo).length} with a logo, ${fetched} looked up`);
  if (writeJson(paths.clubs, clubs)) changed.push("clubs");
} catch (err) {
  console.warn(`club logos skipped: ${(err as Error).message}`);
}

// meta.json changes on every run, so it is not counted as a change.
writeJson(paths.meta, { checkedAt: new Date().toISOString() });
const summary = changed.length > 12 ? `${changed.slice(0, 12).join(", ")} and ${changed.length - 12} more` : changed.join(", ");
log(changed.length ? `done, ${changed.length} updated: ${summary}` : "done, no changes");
