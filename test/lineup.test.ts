import { test } from "node:test";
import assert from "node:assert/strict";
import { disciplines, kind, LINEUP_ISSUES, lineupHistory, lineupPlayers, playerGenders, requiredGender, slots, SUGGEST_LINEUP } from "../src/lineup.ts";
import type { Dataset } from "../src/data.ts";
import type { MatchReport } from "../src/types.ts";

const issues = new Function(`${LINEUP_ISSUES}; return lineupIssues;`)() as (
  games: { kind: string; persons: (string | null)[]; discipline?: string; need?: string }[],
  names: Record<string, string>,
  genders?: Record<string, string>,
) => string[];
const names = { 1: "Anna A", 2: "Ben B" };

test("kind and slots", () => {
  assert.deepEqual(["1.HD", "DD", "D1", "GD", "1.HE", "DE", "E3"].map(kind), ["doubles", "doubles", "doubles", "mixed", "singles", "singles", "singles"]);
  assert.deepEqual([slots("GD"), slots("D2"), slots("2.HE")], [2, 2, 1]);
});

const report = (home: string, games: [string, [string, number | null][]][]): MatchReport => ({
  meeting: 1, home, guest: "X", date: null, time: null,
  games: games.map(([discipline, ps]) => ({
    discipline, home: ps.map(([name, person]) => ({ name, person })), guest: [], sets: [], points: null, setsWon: null, result: null,
  })),
  totals: { points: null, sets: null, games: null }, start: null, end: null, referees: [], approved: true, pdfUrl: null,
});
const dataset = (reports: MatchReport[], label = "Aktive III"): Dataset =>
  ({
    own: { label, name: "OT Bremen III" },
    reports: Object.fromEntries(reports.map((r) => [r.meeting, r])),
    roster: [
      { name: "Z, Team", person: 3, rank: 1, role: "team", gender: "f" },
      { name: "A, Played", person: 4, rank: 2, role: "team" },
      { name: "R, Reserve", person: 5, rank: 9, role: "reserve" },
    ],
  }) as unknown as Dataset;

test("disciplines from a report, else a default per team", () => {
  assert.deepEqual(disciplines(dataset([report("OT Bremen III", [["1.HD", []], ["GD", []]])])), ["1.HD", "GD"]);
  assert.equal(disciplines(dataset([])).length, 8);
  assert.deepEqual(disciplines(dataset([], "Jugend II")), ["D1", "D2", "E1", "E2", "E3", "E4"]);
  assert.deepEqual(disciplines(dataset([], "Mini")), []);
});

test("lineupPlayers: played first, then Stammspieler, then reserves, without duplicates", () => {
  const d = dataset([report("OT Bremen III", [["1.HE", [["Böse, Frank", 7]]], ["2.HE", [["A, Played", 4], ["Nobody", null]]]])]);
  const sections = lineupPlayers(d);
  assert.deepEqual(sections.map((s) => s.label), ["Schon gespielt", "Stammspieler", "Reserve"]);
  assert.deepEqual(sections[0].players.map((p) => p.person), [7, 4]); // sorted as shown: "Frank Böse" before "Played A"
  assert.deepEqual(sections[1].players.map((p) => p.person), [3]);
  assert.deepEqual(sections[2].players.map((p) => p.person), [5]);
});

test("lineupIssues: at most 2 games, never two singles or two doubles", () => {
  assert.deepEqual(issues([{ kind: "doubles", persons: ["1", "2"] }, { kind: "singles", persons: ["1"] }, { kind: "mixed", persons: ["2", null] }], names), []);
  assert.deepEqual(issues([{ kind: "singles", persons: ["1"] }, { kind: "singles", persons: ["1"] }], names), ["Anna A spielt zwei Einzel."]);
  assert.deepEqual(issues([{ kind: "doubles", persons: ["1", "2"] }, { kind: "doubles", persons: ["1", "2"] }], names), ["Anna A spielt zwei Doppel.", "Ben B spielt zwei Doppel."]);
  assert.deepEqual(
    issues([{ kind: "doubles", persons: ["1", "2"] }, { kind: "singles", persons: ["1"] }, { kind: "mixed", persons: ["1", null] }], names),
    ["Anna A spielt 3 Spiele (höchstens 2)."],
  );
  assert.deepEqual(issues([{ kind: "doubles", persons: ["1", "1"] }], names), ["Anna A steht zweimal im selben Doppel."]);
  assert.deepEqual(issues([{ kind: "doubles", persons: [null, ""] }], names), []);
});

test("requiredGender: Herren and Damen games only", () => {
  assert.deepEqual(["1.HD", "HE", "3.HE", "DD", "DE", "GD", "D1", "E2"].map(requiredGender), ["m", "m", "m", "f", "f", null, null, null]);
});

test("playerGenders: roster list first, else the Herren or Damen game played", () => {
  const d = dataset([report("OT Bremen III", [["1.HE", [["Böse, Frank", 7]]], ["DD", [["Q, Quelle", 8], ["Z, Team", 3]]], ["GD", [["M, Mixed", 9]]]])]);
  assert.deepEqual([...playerGenders(d)].sort(), [[3, "f"], [7, "m"], [8, "f"]]);
  assert.equal(lineupPlayers(d)[0].players.find((p) => p.person === 7)?.gender, "m");
  assert.equal(lineupPlayers(d)[0].players.find((p) => p.person === 9)?.gender, undefined);
});

test("lineupIssues: Herren games need men, Damen games women, Mixed one of each (known genders only)", () => {
  const g = { 1: "m", 2: "f", 3: "f" };
  assert.deepEqual(issues([{ kind: "singles", discipline: "1.HE", need: "m", persons: ["1"] }], names, g), []);
  assert.deepEqual(
    issues([{ kind: "singles", discipline: "1.HE", need: "m", persons: ["2"] }], names, g),
    ["Ben B ist als Dame gemeldet, aber 1.HE ist ein Herrenspiel."],
  );
  assert.deepEqual(issues([{ kind: "singles", discipline: "DE", need: "f", persons: ["1"] }], names, g), ["Anna A ist als Herr gemeldet, aber DE ist ein Damenspiel."]);
  assert.deepEqual(issues([{ kind: "mixed", discipline: "GD", need: "", persons: ["1", "2"] }], names, g), []);
  assert.deepEqual(issues([{ kind: "mixed", discipline: "GD", need: "", persons: ["2", "3"] }], { ...names, 3: "Cy C" }, g), ["Im Mixed (GD) spielen ein Herr und eine Dame."]);
  assert.deepEqual(issues([{ kind: "mixed", discipline: "GD", need: "", persons: ["2", "9"] }], names, g), []);
  assert.deepEqual(issues([{ kind: "singles", discipline: "1.HE", need: "m", persons: ["9"] }], names, g), []);
});

type SuggestGame = { discipline: string; kind: string; need: string; persons: (string | null)[]; allowed?: string[] };
const suggest = new Function(`${SUGGEST_LINEUP}; return suggestLineup;`)() as (
  games: SuggestGame[],
  history: Record<string, [string[], number][]>,
  genders?: Record<string, string>,
) => (string | null)[][];
const game = (discipline: string, persons: (string | null)[] = [], allowed?: string[]): SuggestGame => ({
  discipline, kind: kind(discipline), need: requiredGender(discipline) ?? "",
  persons: persons.length ? persons : Array(slots(discipline)).fill(null), allowed,
});

test("lineupHistory: per game who played it, newer Spielberichte weigh more", () => {
  const r1 = { ...report("OT Bremen III", [["1.HD", [["B", 2], ["A", 1]]], ["1.HE", [["A", 1]]]]), meeting: 1 };
  const r2 = { ...report("OT Bremen III", [["1.HD", [["A", 1], ["B", 2]]], ["1.HE", [["C", 3]]]]), meeting: 2 };
  const r3 = { ...report("OT Bremen III", [["1.HE", [["Nobody", null]]]]), meeting: 3 };
  const d = { ...dataset([r1, r2, r3]), schedule: [{ meeting: 1, date: "2026-09-01" }, { meeting: 2, date: "2026-10-01" }, { meeting: 3, date: "2026-11-01" }] } as unknown as Dataset;
  const h = lineupHistory(d);
  // r3 is newest (age 0) but only has a placeholder; r2 is age 1, r1 age 2.
  assert.deepEqual(h["1.HD"], [[["1", "2"], 0.75 + 0.563]]);
  assert.deepEqual(h["1.HE"], [[["3"], 0.75], [["1"], 0.563]]);
});

test("suggestLineup: usual pairs and players, kept slots, partners for half-filled doubles", () => {
  const history: Record<string, [string[], number][]> = {
    "1.HD": [[["1", "2"], 2]], "2.HD": [[["3", "4"], 2]], "1.HE": [[["3"], 2]], "2.HE": [[["1"], 1]],
  };
  assert.deepEqual(suggest([game("1.HD"), game("2.HD"), game("1.HE"), game("2.HE")], history), [["1", "2"], ["3", "4"], ["3"], ["1"]]);
  // Kept slot: 5 plays 1.HE, the usual 3 is free for nothing else of that kind; 1.HD keeps 2 and gets the usual partner 1.
  assert.deepEqual(suggest([game("1.HD", [null, "2"]), game("1.HE", ["5"])], history), [["1", "2"], ["5"]]);
});

test("suggestLineup: rules, fallbacks and empty slots", () => {
  const history: Record<string, [string[], number][]> = { "1.HE": [[["1"], 3]], "2.HE": [[["2"], 1]], DE: [[["3"], 1]], GD: [[["1", "3"], 1]] };
  const g = { 1: "m", 2: "m", 3: "f" };
  // 1 plays 1.HE; for 2.HE the usual 2 still fits; 1 can't play a second single.
  assert.deepEqual(suggest([game("1.HE"), game("2.HE")], history, g), [["1"], ["2"]]);
  // 1.HE taken by someone else: 2 keeps their usual 2.HE, and 1 falls back into 3.HE (a single of the same rule).
  assert.deepEqual(suggest([game("1.HE", ["9"]), game("2.HE"), game("3.HE")], history, g), [["9"], ["2"], ["1"]]);
  // A woman never goes into a Herren game, even as the only candidate.
  assert.deepEqual(suggest([game("1.HE", ["9"]), game("2.HE", ["8"]), game("3.HE")], { DE: [[["3"], 1]] }, g), [["9"], ["8"], [null]]);
  // Mixed: one man and one woman; with a man set, the other man is not added.
  assert.deepEqual(suggest([game("GD", ["2", null])], history, g), [["2", "3"]]);
  // At most 2 games: 1 already plays 2 games, so the Mixed gets another man (2, from any game).
  assert.deepEqual(suggest([game("1.HD", ["1", "7"]), game("1.HE", ["1"]), game("GD", [null, "3"])], history, g), [["1", "7"], ["1"], ["2", "3"]]);
  // …and nobody if there is no other man.
  assert.deepEqual(suggest([game("1.HD", ["1", "7"]), game("1.HE", ["1"]), game("GD", [null, "3"])], { ...history, "2.HE": [] }, g), [["1", "7"], ["1"], [null, "3"]]);
  // Only allowed persons.
  assert.deepEqual(suggest([game("1.HE", [], ["2"])], history, g), [["2"]]);
  // Nothing known: stays empty.
  assert.deepEqual(suggest([game("DD")], {}, g), [[null, null]]);
});
