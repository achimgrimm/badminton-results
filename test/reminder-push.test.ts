import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUpcoming, reminderText } from "../supabase/functions/_shared/reminder-push.ts";
import { berlinInstant, upcomingMatches } from "../src/reminders.ts";
import type { ClubTeam, Meeting } from "../src/types.ts";

const team = { slug: "aktive-1", label: "Aktive I", name: "OT Bremen", league: "L", championship: "C", group: 1, teamtable: 1 } as ClubTeam;
const m = (o: Partial<Meeting>): Meeting => ({ date: "2026-11-15", time: "15:00", note: null, postponed: false, hall: null, home: "OT Bremen", guest: "Gast Ü", result: null, meeting: 1, approved: false, ...o });

test("berlinInstant follows winter and summer time", () => {
  assert.equal(berlinInstant("2026-11-15", "15:00").toISOString(), "2026-11-15T14:00:00.000Z");
  assert.equal(berlinInstant("2026-07-15", "15:00").toISOString(), "2026-07-15T13:00:00.000Z");
});

test("upcomingMatches lists open own matches in the next 7 days", () => {
  const now = new Date("2026-11-14T15:00:00Z");
  const got = upcomingMatches(team, [
    m({}), m({ date: "2026-11-20" }), m({ date: "2026-11-30" }), m({ date: "2026-11-14", time: "10:00" }), m({ result: [5, 3] }),
    m({ time: null }), m({ home: "X", guest: "Y" }), m({ home: "Gast Ü", guest: "OT Bremen", time: "14:00" }),
  ], now);
  assert.deepEqual(got.map((u) => u.game), ["heim-gast-ue", "heim-gast-ue", "auswaerts-gast-ue"]);
  assert.equal(got[0].start, "2026-11-15T14:00:00.000Z");
});

test("parseUpcoming accepts the scraper's list and refuses the rest", () => {
  const u = { team: "aktive-1", season: "2026-27", game: "heim-x", home: "A", guest: "B", start: "2026-11-15T14:00:00.000Z" };
  assert.deepEqual(parseUpcoming([u]), [u]);
  for (const bad of [null, {}, [{ ...u, start: "nope" }], [{ ...u, team: "" }], [{ ...u, game: 1 }]]) assert.equal(parseUpcoming(bad), null);
});

test("reminderText names the match and the Berlin time", () => {
  const t = reminderText({ team: "a", season: "s", game: "g", home: "A", guest: "B", start: "2026-11-15T14:00:00.000Z" });
  assert.match(t.body, /A – B, .*15:00 Uhr/);
});
