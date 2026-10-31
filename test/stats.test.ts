import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReport } from "../src/parse/report.ts";
import { parseSchedule } from "../src/parse/schedule.ts";
import { headToHead, isDoubles, lineup, playerStats, teamForm } from "../src/stats.ts";
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

test("playerStats from a single report, both sides", () => {
  const ot = playerStats([report], "OT Bremen III");
  assert.equal(ot.length, 6);
  assert.equal(ot.at(-1)!.name, "Koschei, Stefan"); // only one with a loss sorts last
  const koschei = ot.find((p) => p.name === "Koschei, Stefan")!;
  assert.deepEqual([koschei.played, koschei.won, koschei.lost], [2, 1, 1]);
  assert.deepEqual(koschei.singles, { played: 1, won: 0, lost: 1 });
  assert.deepEqual(koschei.doubles, { played: 1, won: 1, lost: 0 });
  assert.deepEqual(koschei.sets, [3, 3]);
  assert.deepEqual(koschei.points, [114, 116]);
  assert.deepEqual(koschei.log.map((g) => g.discipline), ["1.HD", "2.HE"]);
  const prigge = ot.find((p) => p.name === "Prigge, Sylvia")!;
  assert.deepEqual(prigge.partners.map((p) => p.name), ["Elges-Meyer, Claudia", "Schuldt, Sören"]);

  // Guest side: sets and points are turned to the player's point of view
  const mahnke = playerStats([report], WALLE).find((p) => p.name === "Mahnke, Elmar")!;
  assert.deepEqual([mahnke.played, mahnke.won, mahnke.lost], [2, 0, 2]);
  const he1 = mahnke.log.find((g) => g.discipline === "1.HE")!;
  assert.deepEqual(he1.sets[0][0] < he1.sets[0][1], true);
  assert.equal(he1.opponentTeam, "OT Bremen III");
  assert.equal(he1.home, false);
  assert.deepEqual(he1.opponents, ["Böse, Frank"]);
});

test("playerStats: walkovers count as wins without sets, placeholders are no players", () => {
  const walkover: MatchReport = structuredClone(report);
  const he1 = walkover.games.find((g) => g.discipline === "1.HE")!;
  he1.guest = [{ name: "nicht anwesend/nicht angetreten", person: null }];
  he1.setsWon = [2, 0];
  he1.points = [42, 0];

  const boese = playerStats([walkover], "OT Bremen III").find((p) => p.name === "Böse, Frank")!;
  const game = boese.log.find((g) => g.discipline === "1.HE")!;
  assert.equal(game.walkover, true);
  assert.equal(game.outcome, "win");
  assert.deepEqual(game.opponents, []);
  assert.deepEqual(boese.sets, [2, 1]); // only the 1.HD
  assert.ok(!playerStats([walkover], WALLE).some((p) => p.person == null));
});

test("playerStats merges a player across reports by person", () => {
  const second: MatchReport = structuredClone(report);
  second.meeting = 1;
  second.guest = "Someone";
  second.date = "2099-01-01";
  const boese = playerStats([report, second], "OT Bremen III").find((p) => p.name === "Böse, Frank")!;
  assert.equal(boese.played, 4);
  assert.deepEqual(boese.partners, [{ name: "Koschei, Stefan", played: 2, won: 2, lost: 0 }]);
  assert.equal(boese.log[0].opponentTeam, "Someone"); // newest first
});

test("playerStats: youth pairings split into singles and doubles", () => {
  const youth = parseReport(fixture("report-youth.html"), 398105);
  const sila = playerStats([youth], "OT Bremen II").find((p) => p.name === "Yilmaz, Sila")!;
  assert.deepEqual(sila.disciplines.map((d) => d.discipline), ["D2", "E4"]);
  assert.deepEqual(sila.singles, { played: 1, won: 1, lost: 0 });
  assert.deepEqual(sila.doubles, { played: 1, won: 1, lost: 0 });
  assert.deepEqual(sila.partners.map((p) => p.name), ["Ruder, Emil"]);
  assert.ok(isDoubles("D1") && isDoubles("GD") && isDoubles("1.HD"));
  assert.ok(!isDoubles("E1") && !isDoubles("DE") && !isDoubles("2.HE"));
});
