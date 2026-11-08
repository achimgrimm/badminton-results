import assert from "node:assert/strict";
import test from "node:test";
import { roleLabel } from "../src/roles.ts";

test("roleLabel picks the strongest role", () => {
  assert.equal(roleLabel(["member"]), "Mitglied");
  assert.equal(roleLabel(["member", "team_lead"]), "Mannschaftsführer");
  assert.equal(roleLabel(["team_lead", "admin", "member"]), "Administrator");
  assert.equal(roleLabel([]), null);
  assert.equal(roleLabel(["unknown"]), null);
});
