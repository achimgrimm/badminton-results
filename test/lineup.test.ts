import { test } from "node:test";
import assert from "node:assert/strict";
import { disciplines, kind, LINEUP_ISSUES, lineupPlayers, playerGenders, requiredGender, slots } from "../src/lineup.ts";
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
