import { urls } from "./config.ts";
import { loadDataset, writeJson } from "./data.ts";
import { fetchHtml } from "./fetch.ts";
import { parseReport, reportAvailable } from "./parse/report.ts";
import { parseSchedule } from "./parse/schedule.ts";
import { parseTable } from "./parse/table.ts";
import { parseCourt, parseTeam } from "./parse/team.ts";

const started = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s] ${msg}`);

const previous = loadDataset();
log(`loaded previous data: ${Object.keys(previous.reports).length} reports, ${Object.keys(previous.halls).length} halls`);

const table = parseTable(await fetchHtml(urls.table()));
log(`table: ${table.length} teams`);
const schedule = parseSchedule(await fetchHtml(urls.schedule()));
log(`schedule: ${schedule.length} meetings, ${schedule.filter((m) => m.result).length} with result`);
const team = parseTeam(await fetchHtml(urls.team()));
log(`team page: ${team.title}`);

// Sanity checks: refuse to overwrite good data with an empty parse.
if (table.length === 0) throw new Error("table parsed empty");
if (schedule.length === 0) throw new Error("schedule parsed empty");

const changed: string[] = [];
if (writeJson("table.json", table)) changed.push("table");
if (writeJson("schedule.json", schedule)) changed.push("schedule");
if (writeJson("team.json", team)) changed.push("team");

// Reports: fetch new ones, and refetch until nuLiga marks them approved.
const played = schedule.filter((m) => m.meeting && m.result);
const toFetch = played.filter((m) => !previous.reports[m.meeting!]?.approved);
log(`reports: ${toFetch.length} to fetch, ${played.length - toFetch.length} already approved`);
for (const [i, m] of toFetch.entries()) {
  const meeting = m.meeting!;
  const known = previous.reports[meeting];
  const label = `  [${i + 1}/${toFetch.length}] ${meeting} ${m.home} – ${m.guest}`;
  const page = await fetchHtml(urls.report(meeting));
  // nuLiga sometimes serves an empty page for a report that is being edited.
  // Keep the last good copy; any other parse error still fails the run.
  if (!reportAvailable(page)) {
    console.warn(`${label}: currently empty on nuLiga, ${known ? "keeping previous copy" : "skipped"}`);
    continue;
  }
  const report = parseReport(page, meeting);
  // The schedule's approval icon is the authoritative signal.
  report.approved ||= m.approved;
  const status = writeJson(`reports/${meeting}.json`, report) ? (known ? "updated" : "new") : "unchanged";
  if (status !== "unchanged") changed.push(`report ${meeting}`);
  log(`${label}: ${status}, ${report.games.length} games${report.approved ? ", approved" : ""}`);
}

// Hall addresses rarely change; fetch each one once.
const halls = { ...previous.halls };
const locations = new Set(schedule.map((m) => m.hall?.location).filter((l): l is number => l != null));
const newLocations = [...locations].filter((l) => !halls[l]);
log(`halls: ${newLocations.length} new of ${locations.size}`);
for (const location of newLocations) {
  halls[location] = parseCourt(await fetchHtml(urls.court(location)), location);
  log(`  hall ${location}: ${halls[location].name}`);
}
if (writeJson("halls.json", halls)) changed.push("halls");

// meta.json is gitignored: it changes every run and would otherwise create hourly commits.
writeJson("meta.json", { checkedAt: new Date().toISOString() });
log(changed.length ? `done, updated: ${changed.join(", ")}` : "done, no changes");
