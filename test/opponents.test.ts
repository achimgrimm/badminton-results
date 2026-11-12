import assert from "node:assert/strict";
import test from "node:test";
import { probableOpponents } from "../src/lineup.ts";
import { lineup, playerStats } from "../src/stats.ts";
import type { MatchReport } from "../src/types.ts";

const report = (meeting: number, guest: { name: string; person: number | null }[]): MatchReport => ({
  meeting, home: "OT", guest: "Gegner", date: "2026-10-01", time: null,
  games: [{ discipline: "1.HE", home: [{ name: "A", person: 1 }], guest, sets: [[21, 10], [21, 10]], points: [42, 20], setsWon: [2, 0], result: [1, 0] }],
  totals: { points: null, sets: null, games: null }, start: null, end: null, referees: [], approved: true, pdfUrl: null,
});

test("lineup entries carry person ids for linking", () => {
  const l = lineup([report(1, [{ name: "B", person: 7 }])], "Gegner");
  assert.deepEqual(l[0].entries[0].persons, [7]);
});

test("opposing players are found with their person and games against us", () => {
  const [p] = playerStats([report(1, [{ name: "B", person: 7 }])], "Gegner");
  assert.equal(p.person, 7);
  assert.equal(p.log[0].opponentTeam, "OT");
  assert.equal(p.log[0].outcome, "loss");
});

test("probableOpponents: the opponent's usual players of one game, empty when unknown", () => {
  const l = lineup([report(1, [{ name: "B", person: 7 }]), report(2, [{ name: "B", person: 7 }]), report(3, [{ name: "C", person: 8 }])], "Gegner");
  const entries = probableOpponents(l, "1.HE");
  assert.deepEqual(entries.map((e) => e.persons), [[7], [8]]);
  assert.deepEqual(probableOpponents(l, "DD"), []);
});
