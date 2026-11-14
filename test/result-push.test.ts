import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNewResults, resultText } from "../supabase/functions/_shared/result-push.ts";
import { newResults } from "../src/new-results.ts";
import type { Meeting } from "../src/types.ts";

const r = { group: 1, meeting: 7, home: "OT 1", guest: "Gast", result: [5, 3] as [number, number] };

test("resultText names team, opponent and score from the team's side", () => {
  assert.deepEqual(resultText(r, "OT 1"), { title: "OT 1: Sieg", body: "OT 1 – Gast 5:3" });
  assert.deepEqual(resultText(r, "Gast"), { title: "Gast: Niederlage", body: "Gast – OT 1 3:5" });
  assert.equal(resultText({ ...r, result: [4, 4] }, "OT 1").title, "OT 1: Unentschieden");
});

test("parseNewResults accepts the scraper's list and refuses the rest", () => {
  assert.deepEqual(parseNewResults([r]), [r]);
  assert.deepEqual(parseNewResults([]), []);
  for (const bad of [null, {}, [{ ...r, result: [1] }], [{ ...r, group: "1" }], [{ ...r, home: "" }], [{ ...r, result: [-1, 2] }]]) {
    assert.equal(parseNewResults(bad), null);
  }
});

const m = (meeting: number | null, result: [number, number] | null): Meeting => ({
  date: "2026-10-01", time: null, note: null, postponed: false, hall: null, home: "A", guest: "B", result, meeting, approved: false,
});

test("newResults lists meetings whose result appeared or changed", () => {
  const before = [m(1, null), m(2, [3, 5]), m(3, [4, 4]), m(null, null)];
  const after = [m(1, [5, 3]), m(2, [3, 5]), m(3, [5, 3]), m(null, [1, 0])];
  assert.deepEqual(newResults(9, before, after).map((x) => x.meeting), [1, 3]);
});
