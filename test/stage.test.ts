import { test } from "node:test";
import assert from "node:assert/strict";
import { stageName } from "../src/config.ts";

// Must match the branch list in .github/workflows/update.yml and scripts/release.sh.
test("stageName turns a branch name into a folder name", () => {
  assert.equal(stageName("test-stages"), "test-stages");
  assert.equal(stageName("feature/Lineup"), "feature-lineup");
  assert.equal(stageName("fix/#22 Lineup!"), "fix-22-lineup");
  assert.equal(stageName("--x--"), "x");
  assert.equal(stageName(""), "");
});
