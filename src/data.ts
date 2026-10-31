import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClubTeam, Hall, MatchReport, Meeting, Standing, TeamInfo } from "./types.ts";

export const DATA_DIR = new URL("../data/", import.meta.url).pathname;

/** Paths inside data/, relative to DATA_DIR. */
export const paths = {
  club: "club.json",
  halls: "halls.json",
  meta: "meta.json",
  table: (group: number) => `groups/${group}/table.json`,
  schedule: (group: number) => `groups/${group}/schedule.json`,
  reports: (group: number) => `groups/${group}/reports`,
  report: (group: number, meeting: number) => `groups/${group}/reports/${meeting}.json`,
  team: (slug: string) => `teams/${slug}.json`,
};

export interface Meta {
  /** ISO timestamp of the last successful scrape */
  checkedAt: string | null;
}

/** Everything needed to render one team's pages. */
export interface Dataset {
  meta: Meta;
  /** The team these pages are for */
  own: ClubTeam;
  /** All club teams, for the team chooser */
  clubTeams: ClubTeam[];
  table: Standing[];
  schedule: Meeting[];
  team: TeamInfo;
  halls: Record<string, Hall>;
  reports: Record<string, MatchReport>;
}

export function readJson<T>(file: string, fallback: T): T {
  const path = join(DATA_DIR, file);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;
}

/** Writes JSON only when content changed, so the log can report real changes. */
export function writeJson(file: string, value: unknown): boolean {
  const path = join(DATA_DIR, file);
  mkdirSync(join(path, ".."), { recursive: true });
  const text = JSON.stringify(value, null, 2) + "\n";
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  writeFileSync(path, text);
  return true;
}

export function loadClubTeams(): ClubTeam[] {
  return readJson<ClubTeam[]>(paths.club, []);
}

export function loadHalls(): Record<string, Hall> {
  return readJson<Record<string, Hall>>(paths.halls, {});
}

export function loadReports(group: number): Record<string, MatchReport> {
  const dir = join(DATA_DIR, paths.reports(group));
  const reports: Record<string, MatchReport> = {};
  if (!existsSync(dir)) return reports;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const r = JSON.parse(readFileSync(join(dir, f), "utf8")) as MatchReport;
    reports[r.meeting] = r;
  }
  return reports;
}

export function loadDataset(own: ClubTeam): Dataset {
  return {
    meta: readJson<Meta>(paths.meta, { checkedAt: null }),
    own,
    clubTeams: loadClubTeams(),
    table: readJson<Standing[]>(paths.table(own.group), []),
    schedule: readJson<Meeting[]>(paths.schedule(own.group), []),
    team: readJson<TeamInfo>(paths.team(own.slug), { title: "", icalUrl: null, webcalUrl: null, pdfUrl: null, halls: [] }),
    halls: loadHalls(),
    reports: loadReports(own.group),
  };
}
