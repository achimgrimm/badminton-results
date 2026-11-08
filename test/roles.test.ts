import assert from "node:assert/strict";
import test from "node:test";
import { cleanDisplayName, MAX_NAME_LENGTH, roleLabel } from "../src/roles.ts";

test("roleLabel picks the strongest role", () => {
  assert.equal(roleLabel(["member"]), "Mitglied");
  assert.equal(roleLabel(["member", "team_lead"]), "Mannschaftsführer");
  assert.equal(roleLabel(["team_lead", "admin", "member"]), "Administrator");
  assert.equal(roleLabel([]), null);
  assert.equal(roleLabel(["unknown"]), null);
});

test("cleanDisplayName trims, collapses whitespace and rejects empty or long names", () => {
  assert.equal(cleanDisplayName("  Anna   Muster "), "Anna Muster");
  assert.equal(cleanDisplayName("   "), null);
  assert.equal(cleanDisplayName(""), null);
  assert.equal(cleanDisplayName("x".repeat(MAX_NAME_LENGTH)), "x".repeat(MAX_NAME_LENGTH));
  assert.equal(cleanDisplayName("x".repeat(MAX_NAME_LENGTH + 1)), null);
});
