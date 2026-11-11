import assert from "node:assert/strict";
import test from "node:test";
import { competingClaims, reconcile } from "../src/claims.ts";

const anna = { person: 1, name: "Anna" };
const bob = { person: 2, name: "Bob" };

test("an approved claim wins over a different device pick", () => {
  assert.deepEqual(reconcile(bob, { ...anna, status: "approved" }, false), { action: "adopt", pick: anna });
  assert.deepEqual(reconcile(null, { ...anna, status: "approved" }, false), { action: "adopt", pick: anna });
  assert.deepEqual(reconcile(anna, { ...anna, status: "approved" }, false), { action: "none" });
});

test("a pending claim fills an empty device and otherwise yields to a new pick", () => {
  assert.deepEqual(reconcile(null, { ...anna, status: "pending" }, false), { action: "adopt", pick: anna });
  assert.deepEqual(reconcile(anna, { ...anna, status: "pending" }, false), { action: "none" });
  assert.deepEqual(reconcile(bob, { ...anna, status: "pending" }, false), { action: "upload", pick: bob, status: "pending" });
});

test("a device pick without a claim is uploaded; approvers' picks are approved at once", () => {
  assert.deepEqual(reconcile(anna, null, false), { action: "upload", pick: anna, status: "pending" });
  assert.deepEqual(reconcile(anna, null, true), { action: "upload", pick: anna, status: "approved" });
  assert.deepEqual(reconcile(anna, { ...anna, status: "pending" }, true), { action: "upload", pick: anna, status: "approved" });
  assert.deepEqual(reconcile(null, null, false), { action: "none" });
});

test("a pick sent earlier that is gone from the server was rejected; a taken player stays on the device", () => {
  assert.deepEqual(reconcile(anna, null, false, { person: 1, ok: true }), { action: "rejected", pick: anna });
  assert.deepEqual(reconcile(anna, null, false, { person: 1, ok: false }), { action: "none" });
  assert.deepEqual(reconcile(bob, null, false, { person: 1, ok: true }), { action: "upload", pick: bob, status: "pending" });
});

test("pending claims for the same player compete; others don't", () => {
  const c = (id: string, team_slug: string, person: number, season = "2026-27") => ({ id, team_slug, season, person });
  const result = competingClaims([c("a", "aktive-i", 1), c("b", "aktive-i", 1), c("c", "aktive-i", 1), c("d", "aktive-i", 2), c("e", "aktive-ii", 1), c("f", "aktive-i", 1, "2027-28")]);
  assert.deepEqual([...result], [["a", 2], ["b", 2], ["c", 2]]);
  assert.equal(competingClaims([]).size, 0);
});
