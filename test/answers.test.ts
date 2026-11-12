import assert from "node:assert/strict";
import test from "node:test";
import { statusMap } from "../src/answers.ts";

test("statusMap: rows of team_answers become { person: status }", () => {
  assert.deepEqual(
    statusMap([{ person: 7, state: "yes" }, { person: 8, state: "no" }, { person: 9, state: "maybe" }]),
    { 7: "yes", 8: "no", 9: "maybe" },
  );
});

test("statusMap: skips malformed rows and unknown states, tolerates non-arrays", () => {
  assert.deepEqual(statusMap([{ person: 1, state: null }, { person: "2", state: "yes" }, { person: 3, state: "x" }, null, {}]), {});
  assert.deepEqual(statusMap(null), {});
  assert.deepEqual(statusMap({ person: 1, state: "yes" }), {});
});
