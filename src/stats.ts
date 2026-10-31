import type { MatchReport, Meeting } from "./types.ts";

/** The team's last n played meetings, newest first. */
export function teamForm(schedule: Meeting[], team: string, n = 5): Meeting[] {
  return schedule
    .filter((m) => m.result && (m.home === team || m.guest === team))
    .sort((a, b) => (b.date + (b.time ?? "")).localeCompare(a.date + (a.time ?? "")))
    .slice(0, n);
}

/** Played meetings between two teams, oldest first. */
export function headToHead(schedule: Meeting[], a: string, b: string): Meeting[] {
  return schedule
    .filter((m) => m.result && ((m.home === a && m.guest === b) || (m.home === b && m.guest === a)))
    .sort((x, y) => x.date.localeCompare(y.date));
}

export interface LineupEntry {
  /** One name for singles, two for doubles */
  players: string[];
  played: number;
  won: number;
  lost: number;
}

export interface DisciplineLineup {
  discipline: string;
  entries: LineupEntry[];
}

const DISCIPLINE_ORDER = ["1.HD", "2.HD", "DD", "1.HE", "2.HE", "DE", "3.HE", "GD"];

/** Who the team fielded per discipline across its reports, most frequent first. */
export function lineup(reports: MatchReport[], team: string): DisciplineLineup[] {
  const byDiscipline = new Map<string, Map<string, LineupEntry>>();
  for (const r of reports) {
    const side = r.home === team ? "home" : r.guest === team ? "guest" : null;
    if (!side) continue;
    for (const g of r.games) {
      const players = g[side].map((p) => p.name);
      if (!players.length) continue;
      const entries = byDiscipline.get(g.discipline) ?? new Map<string, LineupEntry>();
      byDiscipline.set(g.discipline, entries);
      const key = players.join(" / ");
      const entry = entries.get(key) ?? { players, played: 0, won: 0, lost: 0 };
      entries.set(key, entry);
      entry.played++;
      if (g.result) {
        const [mine, other] = side === "home" ? g.result : [g.result[1], g.result[0]];
        if (mine > other) entry.won++;
        else if (mine < other) entry.lost++;
      }
    }
  }
  const rank = (d: string) => (DISCIPLINE_ORDER.indexOf(d) + 1 || 99);
  return [...byDiscipline]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([discipline, entries]) => ({
      discipline,
      entries: [...entries.values()].sort((a, b) => b.played - a.played || b.won - a.won),
    }));
}
