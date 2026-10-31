import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Hall, MatchReport, Meeting, Standing, TeamInfo } from "./types.ts";

export const DATA_DIR = new URL("../data/", import.meta.url).pathname;
const REPORTS_DIR = join(DATA_DIR, "reports");

export interface Meta {
  /** ISO timestamp of the last successful scrape */
  checkedAt: string | null;
}

export interface Dataset {
  meta: Meta;
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

/** Writes JSON only when content changed, keeping git diffs quiet. */
export function writeJson(file: string, value: unknown): boolean {
  const path = join(DATA_DIR, file);
  mkdirSync(join(path, ".."), { recursive: true });
  const text = JSON.stringify(value, null, 2) + "\n";
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  writeFileSync(path, text);
  return true;
}

export function loadDataset(): Dataset {
  const reports: Record<string, MatchReport> = {};
  if (existsSync(REPORTS_DIR)) {
    for (const f of readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json"))) {
      const r = JSON.parse(readFileSync(join(REPORTS_DIR, f), "utf8")) as MatchReport;
      reports[r.meeting] = r;
    }
  }
  return {
    meta: readJson<Meta>("meta.json", { checkedAt: null }),
    table: readJson<Standing[]>("table.json", []),
    schedule: readJson<Meeting[]>("schedule.json", []),
    team: readJson<TeamInfo>("team.json", { title: "", icalUrl: null, webcalUrl: null, pdfUrl: null, halls: [] }),
    halls: readJson<Record<string, Hall>>("halls.json", {}),
    reports,
  };
}
