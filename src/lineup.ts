import type { Dataset } from "./data.ts";
import type { Gender, MatchReport, RosterPlayer } from "./types.ts";
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

/** Each older Spielbericht counts this much less than the next newer one. */
const RECENCY = 0.75;

/**
 * Who usually plays each game: per discipline the persons (one, or a pair as sorted ids) who played it for
 * the team, weighted by recency (newest Spielbericht 1, then ×0.75 per older one), heaviest first.
 * Person ids are strings, like the values of the editor's selects. Feeds suggestLineup in the browser.
 */
export function lineupHistory(d: Dataset): Record<string, [string[], number][]> {
  const dateOf = (r: MatchReport) => d.schedule.find((m) => m.meeting === r.meeting)?.date ?? r.date ?? "";
  const own = Object.values(d.reports)
    .map((r) => ({ r, side: r.home === d.own.name ? ("home" as const) : r.guest === d.own.name ? ("guest" as const) : null }))
    .filter((x) => x.side && x.r.games.length)
    .sort((a, b) => dateOf(b.r).localeCompare(dateOf(a.r)) || b.r.meeting - a.r.meeting);
  const sums = new Map<string, Map<string, number>>();
  own.forEach(({ r, side }, age) => {
    for (const g of r.games) {
      const persons = g[side!].map((p) => p.person).filter((p): p is number => p != null).map(String).sort();
      if (!persons.length) continue;
      const entries = sums.get(g.discipline) ?? new Map<string, number>();
      sums.set(g.discipline, entries);
      const key = persons.join(" ");
      entries.set(key, (entries.get(key) ?? 0) + RECENCY ** age);
    }
  });
  return Object.fromEntries(
    [...sums].map(([discipline, entries]) => [
      discipline,
      [...entries]
        .sort(([ka, a], [kb, b]) => b - a || ka.localeCompare(kb))
        .map(([key, w]): [string[], number] => [key.split(" "), Math.round(w * 1000) / 1000]),
    ]),
  );
}

/**
 * Client-side lineup suggestion as JS source (see LINEUP_ISSUES for why a string).
 * suggestLineup(games, history, genders): games = [{ discipline, kind, need, persons, allowed }] as in
 * lineupIssues, allowed = the person ids the slot may take (its options); history from lineupHistory.
 * Returns the persons per game: filled slots are kept, empty ones get (1) the usual pair or player of that
 * game, then (2) per slot the best player by weight in that game, else ×0.5 in a game of the same kind and
 * gender rule, else ×0.1 any game. Only players who fit the rules are used (at most 2 games, one per kind,
 * gender); a slot nobody fits stays empty. Greedy, heaviest first.
 */
export const SUGGEST_LINEUP = `function suggestLineup(games, history, genders) {
  genders = genders || {};
  var use = {}, all = [], byDiscipline = {};
  var out = games.map(function (g) {
    var x = { discipline: g.discipline, kind: g.kind, need: g.need || "", allowed: g.allowed || null,
      persons: g.persons.map(function (p) { return p || null; }) };
    byDiscipline[g.discipline] = x;
    return x;
  });
  function usage(p) { return use[p] || (use[p] = { total: 0, singles: 0, doubles: 0, mixed: 0 }); }
  function add(p, g) { var e = usage(p); e.total++; e[g.kind]++; }
  function free(g) { return g.persons.filter(function (p) { return !p; }).length; }
  function put(g, p) { g.persons[g.persons.indexOf(null)] = p; add(p, g); }
  function canPlay(p, g, partner) {
    if (g.persons.indexOf(p) >= 0 || p === partner) return false;
    if (g.allowed && g.allowed.indexOf(p) < 0) return false;
    var e = usage(p);
    if (e.total >= 2 || e[g.kind] >= 1) return false;
    if (g.need && genders[p] && genders[p] !== g.need) return false;
    if (g.kind === "mixed") {
      var other = partner || g.persons.filter(Boolean)[0];
      if (other && genders[p] && genders[other] && genders[p] === genders[other]) return false;
    }
    return true;
  }
  out.forEach(function (g) {
    var seen = {};
    g.persons.forEach(function (p) { if (p && !seen[p]) { seen[p] = 1; add(p, g); } });
  });
  Object.keys(history).forEach(function (d) {
    history[d].forEach(function (e) { e[0].forEach(function (p) { if (all.indexOf(p) < 0) all.push(p); }); });
  });

  // 1. The usual pair or player of each game, heaviest first.
  var candidates = [];
  out.forEach(function (g) {
    var slots = free(g), set = g.persons.filter(Boolean);
    if (!slots) return;
    (history[g.discipline] || []).forEach(function (e) {
      if (e[0].length !== g.persons.length) return;
      if (!set.every(function (p) { return e[0].indexOf(p) >= 0; })) return;
      var rest = e[0].filter(function (p) { return set.indexOf(p) < 0; });
      if (rest.length === slots) candidates.push({ g: g, persons: rest, w: e[1] });
    });
  });
  candidates.sort(function (a, b) { return b.w - a.w; });
  candidates.forEach(function (c) {
    if (free(c.g) !== c.persons.length) return;
    var ok = c.persons.every(function (p, i) { return canPlay(p, c.g, i ? c.persons[0] : null); });
    if (ok) c.persons.forEach(function (p) { put(c.g, p); });
  });

  // 2. Single slots: best fitting player by how much they played this game, a similar one, or any.
  function weight(d, p) {
    return (history[d] || []).reduce(function (s, e) { return s + (e[0].indexOf(p) >= 0 ? e[1] : 0); }, 0);
  }
  function score(p, g) {
    var exact = weight(g.discipline, p);
    if (exact) return exact;
    var similar = 0, any = 0;
    Object.keys(history).forEach(function (d) {
      var w = weight(d, p), o = byDiscipline[d];
      if (o && d !== g.discipline && o.kind === g.kind && o.need === g.need) similar += w;
      any += w;
    });
    return similar ? similar * 0.5 : any * 0.1;
  }
  for (;;) {
    var best = null;
    out.forEach(function (g) {
      if (!free(g)) return;
      all.forEach(function (p) {
        if (!canPlay(p, g, null)) return;
        var s = score(p, g);
        if (s > 0 && (!best || s > best.s)) best = { g: g, p: p, s: s };
      });
    });
    if (!best) break;
    put(best.g, best.p);
  }
  return out.map(function (g) { return g.persons; });
}`;
