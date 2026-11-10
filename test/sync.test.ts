import assert from "node:assert/strict";
import test from "node:test";
import { firstSync, fromRemote, mergeRemote, pendingChanges, stampMissing, type Local } from "../src/sync.ts";

const local: Local = { answers: { a: "yes", b: "maybe" }, at: { a: 10, b: 20, c: 30 } };

test("the newer change wins per game, a tie keeps the device's", () => {
  const { local: out, changed } = mergeRemote(local, [
    { key: "a", state: "no", at: 11 },
    { key: "b", state: "no", at: 20 },
    { key: "d", state: "yes", at: 5 },
  ]);
  assert.equal(changed, true);
  assert.deepEqual(out.answers, { a: "no", b: "maybe", d: "yes" });
  assert.equal(out.at.a, 11);
});

test("a newer clearing removes the answer and keeps the time; an older one does nothing", () => {
  const cleared = mergeRemote(local, [{ key: "a", state: null, at: 50 }]);
  assert.deepEqual(cleared.local.answers, { b: "maybe" });
  assert.equal(cleared.local.at.a, 50);
  const stale = mergeRemote(local, [{ key: "a", state: null, at: 5 }]);
  assert.equal(stale.changed, false);
  assert.deepEqual(stale.local, local);
});

test("pending changes are the games stamped after the last upload, cleared ones included", () => {
  assert.deepEqual(pendingChanges(local, { a: 10, b: 5 }), [
    { key: "b", state: "maybe", at: 20 },
    { key: "c", state: null, at: 30 },
  ]);
  assert.deepEqual(pendingChanges(local, { a: 10, b: 20, c: 30 }), []);
});

test("answers without a time get the given one", () => {
  const out = stampMissing({ answers: { a: "yes", b: "no" }, at: { a: 3 } }, 99);
  assert.deepEqual(out.at, { a: 3, b: 99 });
});

test("a copy taken from the server has its times", () => {
  const out = fromRemote([{ key: "a", state: "yes", at: 4 }, { key: "b", state: null, at: 6 }]);
  assert.deepEqual(out, { answers: { a: "yes" }, at: { a: 4, b: 6 } });
});

const s = (key: string, state: "yes" | "maybe" | "no" = "yes") => ({ team: "t", season: "2026-27", key, state });

test("first sign-in: a new account takes the device's answers", () => {
  assert.equal(firstSync([s("a")], [], 0), "upload");
  assert.equal(firstSync([], [], 0), "upload");
});

test("first sign-in: an existing account takes its own unless the device differs", () => {
  assert.equal(firstSync([], [s("a")], 1), "cloud");
  assert.equal(firstSync([s("a")], [s("a")], 1), "cloud");
  assert.equal(firstSync([s("a", "no")], [s("a")], 1), "ask");
  assert.equal(firstSync([s("a"), s("b")], [s("a")], 1), "ask");
});
