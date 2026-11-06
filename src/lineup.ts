import type { Dataset } from "./data.ts";
import type { Gender, RosterPlayer } from "./types.ts";
import { displayName } from "./render/util.ts";

export type GameKind = "singles" | "doubles" | "mixed";

/** Game order of a team sheet, used while a league has no Spielbericht to read it from. */
const FALLBACK: Record<string, string[]> = {
  Aktive: ["1.HD", "2.HD", "DD", "1.HE", "2.HE", "DE", "3.HE", "GD"],
  Jugend: ["D1", "D2", "E1", "E2", "E3", "E4"],
  "Schüler": ["D1", "D2", "E1", "E2", "E3", "E4"],
};

/** "GD" = Mixed, "1.HD"/"DD"/"D1" = doubles, "1.HE"/"DE"/"E1" = singles. */
export function kind(discipline: string): GameKind {
  if (discipline === "GD") return "mixed";
  return /^D\d/.test(discipline) || /D$/.test(discipline) ? "doubles" : "singles";
}

/** Players per game: two for doubles and mixed, one for singles. */
export const slots = (discipline: string): number => (kind(discipline) === "singles" ? 1 : 2);

/** The games of a match in team sheet order: from the league's first Spielbericht, else a default per team. */
export function disciplines(d: Dataset): string[] {
  const report = Object.values(d.reports).find((r) => r.games.length > 0);
  if (report) return report.games.map((g) => g.discipline);
  return FALLBACK[d.own.label.split(" ")[0]] ?? [];
}

/** Herren games ("1.HD", "HE") need men, Damen games ("DD", "2.DE") women; Mixed and the youth games have no rule. */
export function requiredGender(discipline: string): Gender | null {
  return /^(\d\.)?H[DE]$/.test(discipline) ? "m" : /^(\d\.)?D[DE]$/.test(discipline) ? "f" : null;
}

/**
 * Gender per nuLiga person: from the Herren or Damen roster list; for players not on one, from a
 * Herren or Damen game they played in a Spielbericht. Unknown (absent) for the mixed youth lists.
 */
export function playerGenders(d: Dataset): Map<number, Gender> {
  const genders = new Map<number, Gender>();
  for (const r of Object.values(d.reports)) {
    const side = r.home === d.own.name ? "home" : r.guest === d.own.name ? "guest" : null;
    if (!side) continue;
    for (const g of r.games) {
      const gender = requiredGender(g.discipline);
      if (gender) for (const p of g[side]) if (p.person != null) genders.set(p.person, gender);
    }
  }
  for (const p of d.roster) if (p.gender) genders.set(p.person, p.gender);
  return genders;
}

/** Who of the team played in each meeting, so the chosen player's matches count as theirs (see PLAYING). */
export function ownLineups(d: Dataset): Map<number, number[]> {
  const lineups = new Map<number, number[]>();
  for (const r of Object.values(d.reports)) {
    const side = r.home === d.own.name ? "home" : r.guest === d.own.name ? "guest" : null;
    if (!side) continue;
    const persons = new Set(r.games.flatMap((g) => g[side].map((p) => p.person)).filter((p): p is number => p != null));
    if (persons.size) lineups.set(r.meeting, [...persons]);
  }
  return lineups;
}

export interface LineupPlayer {
  person: number;
  name: string;
  gender?: Gender;
}

export interface LineupSection {
  label: string;
  players: LineupPlayer[];
}

/** The players to pick from: who already played this season, then the other Stammspieler, then the reserves. */
export function lineupPlayers(d: Dataset): LineupSection[] {
  const played = new Map<number, string>();
  for (const r of Object.values(d.reports)) {
    const side = r.home === d.own.name ? "home" : r.guest === d.own.name ? "guest" : null;
    if (!side) continue;
    for (const g of r.games) for (const p of g[side]) if (p.person != null) played.set(p.person, p.name);
  }
  const genders = playerGenders(d);
  const withGender = (person: number, name: string): LineupPlayer => ({ person, name, ...(genders.has(person) && { gender: genders.get(person) }) });
  const byName = (a: { name: string }, b: { name: string }) => displayName(a.name).localeCompare(displayName(b.name), "de");
  const rest = (role: RosterPlayer["role"]) =>
    d.roster.filter((p) => p.role === role && !played.has(p.person)).map((p) => withGender(p.person, p.name)).sort(byName);
  return [
    { label: "Schon gespielt", players: [...played].map(([person, name]) => withGender(person, name)).sort(byName) },
    { label: "Stammspieler", players: rest("team") },
    { label: "Reserve", players: rest("reserve") },
  ].filter((s) => s.players.length > 0);
}

/**
 * Client-side lineup check as JS source, so the browser and the tests run the same code.
 * lineupIssues(games, names, genders): games = [{ discipline, kind, need: "m"|"f"|"", persons: [person|null, …] }],
 * names and genders = { person: "Name" } / { person: "m"|"f" } (genders may lack people); returns German warnings.
 * A player plays at most 2 games, never two singles or two doubles; Herren games need men, Damen games women,
 * Mixed one of each (checked only for players whose gender is known).
 * The lineup is saved regardless; the team lead decides.
 */
export const LINEUP_ISSUES = `function lineupIssues(games, names, genders) {
  var per = {}, out = [];
  genders = genders || {};
  function name(p) { return names[p] || "Spieler " + p; }
  games.forEach(function (g) {
    var seen = {};
    g.persons.forEach(function (p) {
      if (!p) return;
      if (g.need && genders[p] && genders[p] !== g.need) {
        out.push(name(p) + " ist als " + (genders[p] === "f" ? "Dame" : "Herr") + " gemeldet, aber " + g.discipline + " ist ein " + (g.need === "m" ? "Herren" : "Damen") + "spiel.");
      }
      var e = per[p] || (per[p] = { total: 0, singles: 0, doubles: 0 });
      if (seen[p]) {
        if (seen[p] === 1) out.push(name(p) + " steht zweimal im selben " + (g.kind === "mixed" ? "Mixed" : "Doppel") + ".");
        seen[p]++;
        return;
      }
      seen[p] = 1;
      e.total++;
      if (g.kind === "singles") e.singles++;
      if (g.kind === "doubles") e.doubles++;
    });
    if (g.kind === "mixed" && g.persons.length === 2 && g.persons[0] && g.persons[1] && g.persons[0] !== g.persons[1]
        && genders[g.persons[0]] && genders[g.persons[0]] === genders[g.persons[1]]) {
      out.push("Im Mixed (" + g.discipline + ") spielen ein Herr und eine Dame.");
    }
  });
  Object.keys(per).forEach(function (p) {
    var e = per[p];
    if (e.total > 2) out.push(name(p) + " spielt " + e.total + " Spiele (höchstens 2).");
    if (e.singles > 1) out.push(name(p) + " spielt " + (e.singles === 2 ? "zwei" : e.singles) + " Einzel.");
    if (e.doubles > 1) out.push(name(p) + " spielt " + (e.doubles === 2 ? "zwei" : e.doubles) + " Doppel.");
  });
  return out;
}`;
