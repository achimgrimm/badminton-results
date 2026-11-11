import type { Game, MatchReport, Meeting, Player } from "./types.ts";

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

type Side = "home" | "guest";

function sideOf(r: MatchReport, team: string): Side | null {
  return r.home === team ? "home" : r.guest === team ? "guest" : null;
}

const other = (side: Side): Side => (side === "home" ? "guest" : "home");

/** A [home, guest] pair turned to the given side's point of view. */
function fromSide(pair: [number, number], side: Side): [number, number] {
  return side === "home" ? pair : [pair[1], pair[0]];
}

function gameOutcome(g: Game, side: Side): "win" | "loss" | null {
  if (!g.result) return null;
  const [mine, theirs] = fromSide(g.result, side);
  return mine > theirs ? "win" : mine < theirs ? "loss" : null;
}

export interface Tally {
  played: number;
  won: number;
  lost: number;
}

function count(t: Tally, outcome: "win" | "loss" | null): void {
  t.played++;
  if (outcome === "win") t.won++;
  else if (outcome === "loss") t.lost++;
}

const tally = (): Tally => ({ played: 0, won: 0, lost: 0 });

export interface LineupEntry extends Tally {
  /** One name for singles, two for doubles */
  players: string[];
  /** nuLiga person ids in the same order; null for placeholders without a person */
  persons: (number | null)[];
}

export interface DisciplineLineup {
  discipline: string;
  entries: LineupEntry[];
}

export const DISCIPLINE_ORDER = ["1.HD", "2.HD", "DD", "1.HE", "2.HE", "DE", "3.HE", "GD", "D1", "D2", "E1", "E2", "E3", "E4"];

/** Doubles: HD, DD, GD and the youth leagues' D1, D2. */
export const isDoubles = (discipline: string) => /D$|^D\d$/.test(discipline);

const disciplineRank = (d: string) => DISCIPLINE_ORDER.indexOf(d) + 1 || 99;

/** Who the team fielded per discipline across its reports, most frequent first. */
export function lineup(reports: MatchReport[], team: string): DisciplineLineup[] {
  const byDiscipline = new Map<string, Map<string, LineupEntry>>();
  for (const r of reports) {
    const side = sideOf(r, team);
    if (!side) continue;
    for (const g of r.games) {
      const players = g[side].map((p) => p.name);
      if (!players.length) continue;
      const entries = byDiscipline.get(g.discipline) ?? new Map<string, LineupEntry>();
      byDiscipline.set(g.discipline, entries);
      const key = players.join(" / ");
      const entry = entries.get(key) ?? { players, persons: g[side].map((p) => p.person), played: 0, won: 0, lost: 0 };
      entries.set(key, entry);
      count(entry, gameOutcome(g, side));
    }
  }
  return [...byDiscipline]
    .sort(([a], [b]) => disciplineRank(a) - disciplineRank(b) || a.localeCompare(b))
    .map(([discipline, entries]) => ({
      discipline,
      entries: [...entries.values()].sort((a, b) => b.played - a.played || b.won - a.won),
    }));
}

/** Placeholders like "nicht anwesend/nicht angetreten" have no nuLiga person. */
const isReal = (p: Player) => p.person != null;

export interface PlayerGame {
  meeting: number;
  date: string;
  opponentTeam: string;
  home: boolean;
  discipline: string;
  partner: string | null;
  opponents: string[];
  /** Set scores from the player's side */
  sets: [number, number][];
  outcome: "win" | "loss" | null;
  /** The other side didn't turn up */
  walkover: boolean;
}

export interface PlayerStats extends Tally {
  name: string;
  person: number | null;
  team: string;
  /** Without walkovers */
  sets: [number, number];
  points: [number, number];
  singles: Tally;
  doubles: Tally;
  disciplines: (Tally & { discipline: string })[];
  partners: (Tally & { name: string })[];
  /** Newest first */
  log: PlayerGame[];
}

/** Per-player record of everyone the team fielded, most appearances first. */
export function playerStats(reports: MatchReport[], team: string): PlayerStats[] {
  const players = new Map<string, PlayerStats & { byDiscipline: Map<string, Tally>; byPartner: Map<string, Tally & { name: string }> }>();
  for (const r of reports) {
    const side = sideOf(r, team);
    if (!side) continue;
    for (const g of r.games) {
      const opponents = g[other(side)];
      const walkover = opponents.length > 0 && !opponents.some(isReal);
      const outcome = gameOutcome(g, side);
      const doubles = g[side].length > 1;
      for (const p of g[side].filter(isReal)) {
        const key = String(p.person);
        let s = players.get(key);
        if (!s) {
          s = {
            name: p.name, person: p.person, team, ...tally(), sets: [0, 0], points: [0, 0],
            singles: tally(), doubles: tally(), disciplines: [], partners: [], log: [],
            byDiscipline: new Map(), byPartner: new Map(),
          };
          players.set(key, s);
        }
        const partner = g[side].find((x) => x !== p);
        count(s, outcome);
        count(doubles ? s.doubles : s.singles, outcome);
        const d = s.byDiscipline.get(g.discipline) ?? tally();
        s.byDiscipline.set(g.discipline, d);
        count(d, outcome);
        if (partner && isReal(partner)) {
          const pt = s.byPartner.get(partner.name) ?? { name: partner.name, ...tally() };
          s.byPartner.set(partner.name, pt);
          count(pt, outcome);
        }
        if (!walkover) {
          const sets = g.setsWon ? fromSide(g.setsWon, side) : [0, 0];
          const points = g.points ? fromSide(g.points, side) : [0, 0];
          s.sets = [s.sets[0] + sets[0], s.sets[1] + sets[1]];
          s.points = [s.points[0] + points[0], s.points[1] + points[1]];
        }
        s.log.push({
          meeting: r.meeting,
          date: r.date ?? "",
          opponentTeam: side === "home" ? r.guest : r.home,
          home: side === "home",
          discipline: g.discipline,
          partner: partner?.name ?? null,
          opponents: opponents.filter(isReal).map((x) => x.name),
          sets: g.sets.map((set) => fromSide(set, side)),
          outcome,
          walkover,
        });
      }
    }
  }
  const byCount = (a: Tally, b: Tally) => b.played - a.played || b.won - a.won;
  return [...players.values()]
    .map(({ byDiscipline, byPartner, ...s }) => ({
      ...s,
      disciplines: [...byDiscipline]
        .sort(([a], [b]) => disciplineRank(a) - disciplineRank(b) || a.localeCompare(b))
        .map(([discipline, t]) => ({ discipline, ...t })),
      partners: [...byPartner.values()].sort(byCount),
      log: s.log.sort(
        (a, b) => b.date.localeCompare(a.date) || b.meeting - a.meeting || disciplineRank(a.discipline) - disciplineRank(b.discipline),
      ),
    }))
    .sort((a, b) => byCount(a, b) || a.name.localeCompare(b.name));
}
