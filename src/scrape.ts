import { urls } from "./config.ts";
import { loadDataset, writeJson } from "./data.ts";
import { fetchHtml } from "./fetch.ts";
import { parseReport } from "./parse/report.ts";
import { parseSchedule } from "./parse/schedule.ts";
import { parseTable } from "./parse/table.ts";
import { parseCourt, parseTeam } from "./parse/team.ts";

const previous = loadDataset();

const table = parseTable(await fetchHtml(urls.table()));
const schedule = parseSchedule(await fetchHtml(urls.schedule()));
const team = parseTeam(await fetchHtml(urls.team()));

// Sanity checks: refuse to overwrite good data with an empty parse.
if (table.length === 0) throw new Error("table parsed empty");
if (schedule.length === 0) throw new Error("schedule parsed empty");

const changed: string[] = [];
if (writeJson("table.json", table)) changed.push("table");
if (writeJson("schedule.json", schedule)) changed.push("schedule");
if (writeJson("team.json", team)) changed.push("team");

// Reports: fetch new ones, and refetch until nuLiga marks them approved.
for (const m of schedule) {
  if (!m.meeting) continue;
  const known = previous.reports[m.meeting];
  if (known?.approved) continue;
  const report = parseReport(await fetchHtml(urls.report(m.meeting)), m.meeting);
  // The schedule's approval icon is the authoritative signal.
  report.approved ||= m.approved;
  if (writeJson(`reports/${m.meeting}.json`, report)) changed.push(`report ${m.meeting}`);
}

// Hall addresses rarely change; fetch each one once.
const halls = { ...previous.halls };
const locations = new Set(schedule.map((m) => m.hall?.location).filter((l): l is number => l != null));
for (const location of locations) {
  if (halls[location]) continue;
  halls[location] = parseCourt(await fetchHtml(urls.court(location)), location);
}
if (writeJson("halls.json", halls)) changed.push("halls");

// meta.json is gitignored: it changes every run and would otherwise create hourly commits.
writeJson("meta.json", { checkedAt: new Date().toISOString() });
console.log(changed.length ? `updated: ${changed.join(", ")}` : "no changes");
