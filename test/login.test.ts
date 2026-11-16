import test from "node:test";
import assert from "node:assert/strict";
import { cleanCode, cleanEmail, loginProblem } from "../src/client/login.ts";

test("cleanEmail trims and checks the shape", () => {
  assert.equal(cleanEmail("  a@b.de "), "a@b.de");
  assert.equal(cleanEmail("a@b"), null);
  assert.equal(cleanEmail("a b@c.de"), null);
  assert.equal(cleanEmail(""), null);
});

test("cleanCode takes exactly six digits", () => {
  assert.equal(cleanCode("123 456"), "123456");
  assert.equal(cleanCode("12345"), null);
  assert.equal(cleanCode("1234567"), null);
});

test("loginProblem tells expired, rate limit and other errors apart", () => {
  assert.equal(loginProblem({ code: "otp_expired" }).expired, true);
  assert.equal(loginProblem({ message: "Token has expired or is invalid" }).expired, true);
  assert.match(loginProblem({ code: "over_email_send_rate_limit", status: 429 }).text, /warte/);
  assert.equal(loginProblem({ message: "boom" }).expired, false);
});
