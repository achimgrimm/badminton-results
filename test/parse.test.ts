import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTable } from "../src/parse/table.ts";
import { parseSchedule } from "../src/parse/schedule.ts";
import { normalizeDiscipline, parseReport, reportAvailable } from "../src/parse/report.ts";
import { leagueName, parseClubTeams, teamSlug } from "../src/parse/club.ts";
import { parseCourt, parseTeam } from "../src/parse/team.ts";
import { parsePools } from "../src/parse/pools.ts";

const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");

test("table", () => {
  const table = parseTable(fixture("table.html"));
  assert.equal(table.length, 7);
  const ot = table.find((s) => s.team === "OT Bremen III")!;
  assert.deepEqual(
    { rank: ot.rank, teamtable: ot.teamtable, points: ot.points, games: ot.games, sets: ot.sets, zone: ot.zone },
    { rank: 2, teamtable: 242926, points: [4, 2], games: [15, 9], sets: [33, 23], zone: "up" },
  );
  assert.equal(table[0].team, "SV Weyhe IV");
});

test("schedule", () => {
  const meetings = parseSchedule(fixture("schedule.html"));
  assert.equal(meetings.length, 42);
  // second match on 12.09. has empty date cells
  assert.equal(meetings[1].date, "2026-09-12");
  assert.equal(meetings[1].time, "18:30");
  const m = meetings.find((x) => x.meeting === 397415)!;
  assert.equal(m.home, "OT Bremen III");
  assert.equal(m.guest, "TV Bremen-Walle 1875 III");
  assert.deepEqual(m.result, [7, 1]);
  assert.equal(m.hall?.name, "Sportanlage Schevemoor");
  assert.equal(m.hall?.location, 13566);
  const moved = meetings.find((x) => x.date === "2026-10-28")!;
  assert.equal(moved.postponed, true);
  assert.match(moved.note!, /ursprünglicher Termin/);
  const upcoming = meetings.find((x) => x.date === "2026-10-31")!;
  assert.equal(upcoming.result, null);
  assert.equal(upcoming.meeting, null);
  assert.equal(meetings.filter((x) => x.approved).length, 7);
});

test("report", () => {
  const r = parseReport(fixture("report-397415.html"), 397415);
  assert.equal(r.home, "OT Bremen III");
  assert.equal(r.date, "2026-09-26");
  assert.equal(r.time, "19:30");
  assert.equal(r.games.length, 8);
  assert.deepEqual(r.totals, { points: [380, 278], sets: [15, 4], games: [7, 1] });
  const he2 = r.games.find((g) => g.discipline === "2.HE")!;
  assert.deepEqual(he2.sets, [[16, 21], [21, 16], [16, 21]]);
  assert.deepEqual(he2.result, [0, 1]);
  const hd1 = r.games[0];
  assert.equal(hd1.discipline, "1.HD");
  assert.deepEqual(hd1.home.map((p) => p.name), ["Böse, Frank", "Koschei, Stefan"]);
  assert.equal(hd1.home[0].person, 1307021);
  assert.equal(r.games.find((g) => g.discipline === "DD")!.sets.length, 2);
  assert.deepEqual([r.start, r.end], ["19:30", "21:10"]);
  assert.deepEqual(r.referees, ["Lienig, Nicola"]);
  assert.equal(r.approved, false);
  assert.match(r.pdfUrl!, /^https:\/\/.*MeetingReportTTFOP/);
});

test("team", () => {
  const t = parseTeam(fixture("team.html"));
  assert.match(t.webcalUrl!, /^webcal:\/\/.*getTeamMeetingsWebcal\?teamid=177901/);
  assert.match(t.icalUrl!, /^https:\/\//);
  assert.ok(t.halls.some((h) => h.location === 13566));
});

test("court", () => {
  const c = parseCourt(fixture("court.html"), 13566);
  assert.equal(c.name, "Sportanlage Schevemoor (09-28325-1)");
  assert.deepEqual(c.address, ["Walliser Straße 119", "28325 Bremen (Osterholz)"]);
  assert.match(c.mapsUrl!, /google\.com\/maps/);
});

test("schedule: 0:0 placeholder of an unfilled report is no result", () => {
  const html = fixture("schedule.html").replace(/(meeting=397415[^>]*>\s*<span>\s*)7:1/, "$10:0");
  const m = parseSchedule(html).find((x) => x.meeting === 397415)!;
  assert.equal(m.result, null);
  assert.equal(m.meeting, 397415);
});

test("report: empty page while nuLiga edits the report", () => {
  assert.equal(reportAvailable(fixture("report-empty.html")), false);
  assert.equal(reportAvailable(fixture("report-397415.html")), true);
});

test("club teams", () => {
  const teams = parseClubTeams(fixture("club-teams.html"));
  assert.deepEqual(teams.map((t) => t.label), ["Aktive", "Jugend", "Jugend II", "Schüler", "Aktive II", "Aktive III"]);
  assert.deepEqual(teams.at(-1), { label: "Aktive III", league: "Kreisliga Bremen", championship: "KV Bremen 26/27", group: 41836 });
  assert.equal(teams[1].group, teams[2].group); // Jugend and Jugend II share a league
});

test("team names and slugs from club labels", () => {
  assert.equal(leagueName("Aktive"), "OT Bremen");
  assert.equal(leagueName("Jugend II"), "OT Bremen II");
  assert.equal(leagueName("Aktive III"), "OT Bremen III");
  assert.equal(teamSlug("Aktive III"), "aktive-3");
  assert.equal(teamSlug("Jugend II"), "jugend-2");
  assert.equal(teamSlug("Schüler"), "schueler");
});

test("youth report: numbered pairings, players on both sides", () => {
  const r = parseReport(fixture("report-youth.html"), 398105);
  assert.equal(r.home, "OT Bremen II");
  assert.equal(r.guest, "TV Bremen-Walle 1875");
  assert.deepEqual(r.games.map((g) => g.discipline), ["D1", "D2", "E1", "E2", "E3", "E4"]);
  assert.deepEqual(r.games.map((g) => [g.home.length, g.guest.length]), [[2, 2], [2, 2], [1, 1], [1, 1], [1, 1], [1, 1]]);
  assert.deepEqual(r.games[4].sets, [[21, 18], [19, 21], [21, 18]]);
  assert.deepEqual(r.totals.games, [4, 2]);
  assert.equal(normalizeDiscipline("D2-D2"), "D2");
  assert.equal(normalizeDiscipline("3-3"), "E3");
  assert.equal(normalizeDiscipline("1.HE"), "1.HE");
});

test("report with totals only", () => {
  const r = parseReport(fixture("report-summary.html"), 397501);
  assert.equal(r.home, "TV Eiche Horn");
  assert.equal(r.guest, "TV Bremen-Walle 1875");
  assert.deepEqual(r.games, []);
  assert.deepEqual(r.totals, { points: [218, 190], sets: [14, 8], games: [4, 2] });
});

test("club pools", () => {
  const rows = parsePools(fixture("club-pools.html"));
  assert.equal(rows.length, 27);
  assert.deepEqual(rows[0], { rank: 1, team: 1, name: "Mojzis, Christoph", person: 1340016 });
  assert.deepEqual(rows.filter((r) => r.team === 3).map((r) => r.name), ["Böse, Frank", "Bischoff, Denis", "Schütte, Timo", "Groenhoff, Nils"]);
  const reserve = rows.find((r) => r.name === "Grimm, Achim")!;
  assert.deepEqual(reserve, { rank: 24, team: null, name: "Grimm, Achim", person: 1541141 });
  assert.deepEqual(parsePools(fixture("club-pools-empty.html")), []);
});
