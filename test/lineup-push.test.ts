import assert from "node:assert/strict";
import test from "node:test";
import { confirmText, lineupNotices, noticeText } from "../supabase/functions/_shared/lineup-push.ts";

const pick = (...n: ReturnType<typeof lineupNotices>) => n.map((x) => `${x.person}:${x.kind}:${x.games.join("+")}`).sort();

test("first publication: every placed player is told their games", () => {
  assert.deepEqual(pick(...lineupNotices(null, { "1.HD": ["1", "2"], "1.HE": ["3"], DE: [null] })), ["1:published:1.HD", "2:published:1.HD", "3:published:1.HE"]);
});

test("republishing the same lineup is silent", () => {
  const l = { "1.HD": ["1", "2"], "1.HE": ["3"] };
  assert.deepEqual(lineupNotices(l, { "1.HE": ["3"], "1.HD": ["2", "1"] }), []);
});

test("changes: added, moved, new partner and removed players", () => {
  const prev = { "1.HD": ["1", "2"], "1.HE": ["3"] };
  const next = { "1.HD": ["1", "4"], "1.HE": ["2"] };
  assert.deepEqual(pick(...lineupNotices(prev, next)), ["1:changed:1.HD", "2:changed:1.HE", "3:removed:1.HE", "4:changed:1.HD"]);
});

test("texts say what happened", () => {
  assert.equal(noticeText({ person: "1", kind: "published", games: ["1.HD", "DE"] }, "Heim gegen X").body, "Aufstellung veröffentlicht: Du spielst 1.HD, DE.");
  assert.ok(noticeText({ person: "1", kind: "changed", games: ["1.HD"] }, "X").body.includes("jetzt 1.HD"));
  assert.ok(noticeText({ person: "1", kind: "removed", games: ["1.HD"] }, "X").body.includes("nicht mehr"));
  assert.equal(noticeText({ person: "1", kind: "removed", games: [] }, "x".repeat(300)).title.length, 100);
});

test("publisher confirmation tells how many players were notified", () => {
  assert.equal(confirmText("X", 0).body, "Aufstellung veröffentlicht. Niemand wurde neu benachrichtigt.");
  assert.equal(confirmText("X", 1).body, "Aufstellung veröffentlicht. 1 Spieler wurde benachrichtigt.");
  assert.equal(confirmText("X", 5).body, "Aufstellung veröffentlicht. 5 Spieler wurden benachrichtigt.");
});
