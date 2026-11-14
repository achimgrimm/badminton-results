import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldNotify, signinText } from "../supabase/functions/_shared/signin-push.ts";

test("shouldNotify only for a first pending pick of a non-approver", () => {
  const base = { alreadyNotified: false, callerCanApprove: false, hasPendingClaim: true };
  assert.equal(shouldNotify(base), true);
  assert.equal(shouldNotify({ ...base, alreadyNotified: true }), false);
  assert.equal(shouldNotify({ ...base, callerCanApprove: true }), false);
  assert.equal(shouldNotify({ ...base, hasPendingClaim: false }), false);
});

test("signinText names the account and the player", () => {
  assert.equal(signinText("Anna", "Bea Kern").body, "Anna möchte Bea Kern sein. Tippen zum Bestätigen.");
  assert.match(signinText(null, "X").body, /^Jemand möchte X/);
});
