import { test } from "node:test";
import assert from "node:assert/strict";
import { followStartText, ownMatchFor, parseMeetings } from "../supabase/functions/_shared/follow-push.ts";
import { upcomingMeetings } from "../src/reminders.ts";
import type { Meeting } from "../src/types.ts";

const m = (o: Partial<Meeting>): Meeting => ({ date: "2026-11-15", time: "15:00", note: null, postponed: false, hall: null, home: "A", guest: "B", result: null, meeting: 7, approved: false, ...o });

test("upcomingMeetings lists open meetings of any teams in the next 7 days", () => {
  const now = new Date("2026-11-14T15:00:00Z");
  const got = upcomingMeetings(3, [m({}), m({ meeting: 8, date: "2026-11-30" }), m({ meeting: 9, result: [5, 3] }), m({ meeting: null }), m({ meeting: 10, time: null }), m({ meeting: 11, date: "2026-11-10" })], now);
  assert.deepEqual(got, [{ group: 3, meeting: 7, home: "A", guest: "B", start: "2026-11-15T14:00:00.000Z" }]);
});

test("parseMeetings accepts the scraper's list and refuses the rest", () => {
  const u = { group: 3, meeting: 7, home: "A", guest: "B", start: "2026-11-15T14:00:00.000Z" };
  assert.deepEqual(parseMeetings([u]), [u]);
  for (const bad of [null, {}, [{ ...u, start: "nope" }], [{ ...u, group: "3" }], [{ ...u, home: "" }]]) assert.equal(parseMeetings(bad), null);
});

test("ownMatchFor finds the own match of a meeting by teams and kick-off", () => {
  const own = [{ home: "A", guest: "B", start: "2026-11-15T14:00:00+00:00", game: 1 }, { home: "A", guest: "C", start: "2026-11-15T14:00:00Z", game: 2 }];
  const meeting = { home: "A", guest: "B", start: "2026-11-15T14:00:00.000Z" };
  assert.equal(ownMatchFor(meeting, own)?.game, 1);
  assert.equal(ownMatchFor({ ...meeting, start: "2026-11-15T15:00:00.000Z" }, own), undefined);
  assert.equal(ownMatchFor({ ...meeting, guest: "Z" }, own), undefined);
});

test("followStartText names the team, the match and the Berlin time", () => {
  const t = followStartText({ group: 3, meeting: 7, home: "A", guest: "B", start: "2026-11-15T14:00:00.000Z" }, "A");
  assert.equal(t.title, "Spiel von A");
  assert.match(t.body, /A – B, .*15:00 Uhr/);
});
