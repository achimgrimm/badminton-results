import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReport } from "../src/parse/report.ts";
import { parseSchedule } from "../src/parse/schedule.ts";
import { headToHead, lineup, teamForm } from "../src/stats.ts";
import type { MatchReport } from "../src/types.ts";

const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");
const schedule = parseSchedule(fixture("schedule.html"));
const report = parseReport(fixture("report-397415.html"), 397415);
const WALLE = "TV Bremen-Walle 1875 III";

test("teamForm: newest first, played only", () => {
  const form = teamForm(schedule, "OT Bremen III");
  assert.deepEqual(form.map((m) => m.meeting), [397398, 397415, 397396]);
  assert.equal(teamForm(schedule, "OT Bremen III", 1).length, 1);
});

test("headToHead", () => {
  assert.deepEqual(headToHead(schedule, "OT Bremen III", "TV Eiche Horn V"), []);
  assert.deepEqual(headToHead(schedule, WALLE, "OT Bremen III").map((m) => m.meeting), [397415]);
});

test("lineup from a single report", () => {
  const l = lineup([report], WALLE);
  assert.equal(l.length, 8);
  assert.deepEqual(l.map((d) => d.discipline), ["1.HD", "2.HD", "DD", "1.HE", "2.HE", "DE", "3.HE", "GD"]);
  const he1 = l.find((d) => d.discipline === "1.HE")!;
  assert.deepEqual(he1.entries, [{ players: ["Mahnke, Elmar"], played: 1, won: 0, lost: 1 }]);
  const he2 = l.find((d) => d.discipline === "2.HE")!;
  assert.equal(he2.entries[0].won, 1);
  assert.deepEqual(lineup([report], "Unknown"), []);
});

test("lineup counts across reports and sorts by appearances", () => {
  // Walle again (still the guest side) against another opponent, with a different 1.HE player
  const second: MatchReport = structuredClone(report);
  second.meeting = 1;
  second.home = "Someone";
  second.games.find((g) => g.discipline === "1.HE")!.guest = [{ name: "Neu, Nora", person: null }];
  const third: MatchReport = structuredClone(report);
  third.meeting = 2;

  const he1 = lineup([report, second, third], WALLE).find((d) => d.discipline === "1.HE")!;
  assert.deepEqual(he1.entries, [
    { players: ["Mahnke, Elmar"], played: 2, won: 0, lost: 2 },
    { players: ["Neu, Nora"], played: 1, won: 0, lost: 1 },
  ]);
});
