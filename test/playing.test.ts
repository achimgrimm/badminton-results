import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYING_STATE } from "../src/playing.ts";

const { next, migrate } = new Function(`${PLAYING_STATE}; return { next: nextPlaying, migrate: migratePlaying };`)() as {
  next: (state?: string) => string;
  migrate: (raw: unknown) => Record<string, string>;
};

test("a tap cycles yes, maybe, no and back to unanswered", () => {
  assert.deepEqual(["", "yes", "maybe", "no"].map(next), ["yes", "maybe", "no", ""]);
  assert.equal(next(undefined), "yes");
  assert.equal(next("junk"), "");
});

test("the old list of keys becomes yes answers", () => {
  assert.deepEqual(migrate(["heim-A", "auswaerts-B"]), { "heim-A": "yes", "auswaerts-B": "yes" });
});

test("stored answers are kept, anything else is dropped", () => {
  assert.deepEqual(migrate({ a: "yes", b: "maybe", c: "no", d: "perhaps", e: 1 }), { a: "yes", b: "maybe", c: "no" });
  assert.deepEqual(migrate(["x", 3, null]), { x: "yes" });
  assert.deepEqual([migrate(null), migrate("text"), migrate(7)], [{}, {}, {}]);
});
